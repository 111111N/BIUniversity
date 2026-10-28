import { BACKUP_DATABASES, BACKUP_LIMITS, addBackupText, checkBackupAbort, createBackupBudget, isPortalStorageKey, type AdministrativeBackup, type BackupBudget, type BackupValue } from "./localBackup";

function invalid(part: string): never { throw new Error(`Архив повреждён или несовместим: ${part}. Исходные данные не изменены.`); }
const object = (value: unknown, part: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(part);
  return value as Record<string, unknown>;
};
const fields = (value: Record<string, unknown>, allowed: string[], part: string) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(`${part}: неизвестные поля`);
};
const text = (value: unknown, part: string): string => typeof value === "string" ? value : invalid(part);
const list = (value: unknown, part: string): unknown[] => Array.isArray(value) ? value : invalid(part);
const integer = (value: unknown, part: string): number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid(part);
const date = (value: unknown, part: string): string => {
  const result = text(value, part);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) invalid(part);
  return result;
};
const unique = (keys: Set<string>, value: string, part: string) => { if (keys.has(value)) invalid(`${part}: повторяющийся ключ`); keys.add(value); };
const keyPath = (value: unknown, nullable: boolean) => {
  if (value === null && nullable) return;
  if (typeof value === "string") return;
  if (Array.isArray(value) && value.length && value.every((item) => typeof item === "string")) return;
  invalid("путь ключа хранилища");
};

function validateValue(value: unknown, budget: BackupBudget, depth = 0): asserts value is BackupValue {
  if (++budget.nodes > BACKUP_LIMITS.nodes || depth > 32) invalid("слишком сложная структура значений");
  const node = object(value, "типизированное значение");
  const type = text(node.type, "тип значения");
  fields(node, type === "object" ? ["type", "entries"] : type === "blob" ? ["type", "base64", "size", "mediaType", "file"] : ["type", ...(type === "null" || type === "undefined" ? [] : ["value"])], "значение");
  switch (type) {
    case "null": case "undefined": return;
    case "string": addBackupText(budget, text(node.value, "строка")); return;
    case "number": if (typeof node.value !== "number" || !Number.isFinite(node.value)) invalid("число"); return;
    case "boolean": if (typeof node.value !== "boolean") invalid("логическое значение"); return;
    case "date": date(node.value, "дата значения"); return;
    case "array": for (const item of list(node.value, "массив")) validateValue(item, budget, depth + 1); return;
    case "object": {
      const keys = new Set<string>();
      for (const pair of list(node.entries, "поля объекта")) {
        if (!Array.isArray(pair) || pair.length !== 2) invalid("пара ключ/значение");
        const key = text(pair[0], "ключ поля"); unique(keys, key, "поля объекта"); addBackupText(budget, key); validateValue(pair[1], budget, depth + 1);
      }
      return;
    }
    case "blob": {
      const size = integer(node.size, "размер вложения");
      budget.binaryBytes += size; budget.files++;
      if (budget.binaryBytes > BACKUP_LIMITS.binaryBytes) invalid("вложения превышают 64 МиБ");
      const base64 = text(node.base64, "содержимое вложения");
      const padding = size % 3 === 1 ? "==" : size % 3 === 2 ? "=" : "";
      if (base64.length !== 4 * Math.ceil(size / 3) || (padding && !base64.endsWith(padding))) invalid("размер или кодировка вложения");
      const body = base64.slice(0, base64.length - padding.length);
      if (!/^[A-Za-z0-9+/]*$/.test(body)) invalid("кодировка вложения");
      const last = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(body.at(-1) ?? "A");
      if ((padding === "==" && last % 16 !== 0) || (padding === "=" && last % 4 !== 0)) invalid("неканоническая кодировка вложения");
      addBackupText(budget, text(node.mediaType, "тип вложения"));
      if (node.file !== undefined) {
        const file = object(node.file, "метаданные файла"); fields(file, ["name", "lastModified"], "метаданные файла");
        addBackupText(budget, text(file.name, "имя файла"));
        if (typeof file.lastModified !== "number" || !Number.isSafeInteger(file.lastModified)) invalid("дата изменения файла");
      }
      return;
    }
    default: invalid("неизвестный тип значения");
  }
}

export const canonicalBackupValue = (value: BackupValue): string => {
  const normalize = (node: BackupValue): unknown => {
    switch (node.type) {
      case "null": case "undefined": return [node.type];
      case "object": return [node.type, [...node.entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, normalize(item)])];
      case "array": return [node.type, node.value.map(normalize)];
      case "blob": return [node.type, node.size, node.mediaType, node.base64, node.file ? [node.file.name, node.file.lastModified] : null];
      default: return [node.type, node.value];
    }
  };
  return JSON.stringify(normalize(value));
};
const validKey = (node: BackupValue): boolean => node.type === "string" || node.type === "number" || node.type === "date" || (node.type === "array" && node.value.length > 0 && node.value.every(validKey));

/** Validate untrusted JSON without decoding files, executing migrations or consulting live stores. */
export async function validateAdministrativeBackup(value: unknown, signal?: AbortSignal): Promise<AdministrativeBackup> {
  checkBackupAbort(signal);
  const root = object(value, "документ");
  if (root.format !== "bi-university-local-backup" || root.scope !== "administrative") invalid("это не административная резервная копия портала");
  if (root.version !== 1) invalid("версия формата не поддерживается");
  let nodes = 0;
  const checkShape = async (item: unknown, depth = 0): Promise<void> => {
    // One encoded value expands into its type tag, container and object-entry tuples.
    if (++nodes > BACKUP_LIMITS.nodes * 8 || depth > 128) invalid("слишком сложный документ");
    if (nodes % 2048 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); }
    if (item && typeof item === "object") for (const child of Object.values(item)) await checkShape(child, depth + 1);
  };
  await checkShape(value); checkBackupAbort(signal);
  fields(root, ["format", "version", "scope", "startedAt", "completedAt", "actor", "source", "consistency", "exclusions", "localStorage", "databases", "totals"], "документ");
  const startedAt = date(root.startedAt, "время начала"); const completedAt = date(root.completedAt, "время завершения");
  if (Date.parse(startedAt) > Date.parse(completedAt)) invalid("хронология архива");
  const actor = object(root.actor, "автор"); fields(actor, ["id", "revision"], "автор");
  if (!text(actor.id, "ID автора") || integer(actor.revision, "ревизия автора") < 1) invalid("автор");
  const source = object(root.source, "источник"); fields(source, ["origin", "basePath"], "источник");
  const origin = text(source.origin, "адрес источника");
  try { const url = new URL(origin); if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) invalid("адрес источника"); } catch { invalid("адрес источника"); }
  if (!/^\/.*\/$/.test(text(source.basePath, "базовый путь")) && source.basePath !== "/") invalid("базовый путь");
  if (root.consistency !== "per-database-readonly-transaction") invalid("режим согласованности");
  list(root.exclusions, "исключения").forEach((item) => text(item, "исключение"));
  const budget = createBackupBudget(); const storageKeys = new Set<string>();
  for (const value of list(root.localStorage, "локальные данные")) {
    const entry = object(value, "локальная запись"); fields(entry, ["key", "raw"], "локальная запись");
    const key = text(entry.key, "ключ локальной записи"); if (!isPortalStorageKey(key)) invalid("посторонний ключ локальных данных");
    unique(storageKeys, key, "локальные данные"); addBackupText(budget, key); addBackupText(budget, text(entry.raw, "исходная строка"));
  }
  const databaseNames = new Set<string>();
  for (const value of list(root.databases, "файловые хранилища")) {
    const database = object(value, "база данных"); fields(database, ["name", "version", "capturedAt", "stores"], "база данных");
    const name = text(database.name, "имя базы"); unique(databaseNames, name, "базы данных");
    const definition = BACKUP_DATABASES.find((item) => item.name === name); if (!definition) invalid("неизвестная база данных");
    const capturedAt = date(database.capturedAt, "время чтения базы");
    if (Date.parse(capturedAt) < Date.parse(startedAt) || Date.parse(capturedAt) > Date.parse(completedAt)) invalid("хронология базы");
    const stores = list(database.stores, "хранилища базы");
    if (database.version === null) { if (stores.length) invalid("записи в отсутствующей базе"); continue; }
    if (integer(database.version, "версия базы") < 1) invalid("версия базы");
    const storeNames = new Set<string>();
    for (const value of stores) {
      const store = object(value, "хранилище"); fields(store, ["name", "keyPath", "autoIncrement", "indexes", "records"], "хранилище");
      unique(storeNames, text(store.name, "имя хранилища"), "хранилища"); keyPath(store.keyPath, true);
      if (typeof store.autoIncrement !== "boolean") invalid("генератор ключей");
      const indexNames = new Set<string>();
      for (const value of list(store.indexes, "индексы")) {
        const index = object(value, "индекс"); fields(index, ["name", "keyPath", "unique", "multiEntry"], "индекс");
        unique(indexNames, text(index.name, "имя индекса"), "индексы"); keyPath(index.keyPath, false);
        if (typeof index.unique !== "boolean" || typeof index.multiEntry !== "boolean") invalid("свойства индекса");
      }
      const recordKeys = new Set<string>();
      for (const value of list(store.records, "записи")) {
        if (++budget.records > BACKUP_LIMITS.records) invalid("больше 25 000 файловых записей");
        if (budget.records % 128 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); }
        const record = object(value, "запись"); fields(record, ["key", "value"], "запись");
        validateValue(record.key, budget); if (!validKey(record.key)) invalid("первичный ключ записи");
        unique(recordKeys, canonicalBackupValue(record.key), "записи хранилища"); validateValue(record.value, budget);
      }
    }
    if (!storeNames.has(definition.store)) invalid("отсутствует обязательное хранилище базы");
  }
  if (databaseNames.size !== BACKUP_DATABASES.length) invalid("неполный перечень баз данных");
  const totals = object(root.totals, "итоги"); fields(totals, ["storageEntries", "databaseRecords", "files", "binaryBytes"], "итоги");
  for (const [key, expected] of Object.entries({ storageEntries: storageKeys.size, databaseRecords: budget.records, files: budget.files, binaryBytes: budget.binaryBytes })) {
    if (integer(totals[key], `итог ${key}`) !== expected) invalid("итоги не совпадают с содержимым");
  }
  checkBackupAbort(signal);
  return value as AdministrativeBackup;
}
