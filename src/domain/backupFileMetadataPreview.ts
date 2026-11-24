import { BACKUP_DATABASES, BACKUP_LIMITS, checkBackupAbort, type AdministrativeBackup, type BackupValue } from "./localBackup";
import type { BackupDifference, BackupDifferenceReference } from "./backupComparison";
import { BACKUP_FILE_FIELDS, compareBackupFileDifference, readBackupFileMetadata, type BackupFileField } from "./backupFileDifference";
import type { BackupRecordPreview } from "./backupRecordPreview";

type Reference = Extract<BackupDifferenceReference, { storage: "indexedDB" }>;
type Database = AdministrativeBackup["databases"][number];
const LABELS: Record<Exclude<BackupFileField, "content">, string> = { name: "Имя", type: "Тип файла", size: "Размер, байт", createdAt: "Дата создания", scope: "Область хранения", category: "Категория", uploadedBy: "Сохранённое имя загрузившего", description: "Описание", pinned: "Закрепление", fileName: "Имя сохранённого File", lastModified: "Дата изменения File" };
const MAX_PREVIEW_BYTES = 128 * 1024;

export const canPreviewBackupFileMetadata = (difference: BackupDifference): difference is BackupDifference & { reference: Reference } => {
  const reference = difference.reference;
  return difference.kind === "different" && reference?.storage === "indexedDB" && reference.key.type === "string" && Boolean(reference.key.value.trim())
    && difference.id === reference.key.value && difference.fileDifference?.status === "compared"
    && BACKUP_DATABASES.some(source => source.name === reference.database && source.store === reference.store);
};
const display = (value: BackupValue | undefined, field: BackupFileField) => {
  if (value === undefined) return "Поле отсутствует";
  if (value.type === "undefined") return "Сохранено undefined";
  if (value.type === "boolean") return value.value ? "Да" : "Нет";
  if (value.type === "string") {
    if (value.value.length * 2 > MAX_PREVIEW_BYTES) throw new Error("Метаданные слишком велики для просмотра. Частичный текст не показан.");
    return JSON.stringify(value.value);
  }
  if (value.type === "number") {
    if (field === "createdAt" || field === "lastModified") {
      const date = new Date(value.value);
      return `${Number.isFinite(date.getTime()) ? `${date.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (МСК)` : "Вне диапазона календарной даты"}\nСохранено: ${value.value} мс Unix`;
    }
    return JSON.stringify(value.value);
  }
  throw new Error("Метаданные содержат неподдерживаемый тип. Частичный просмотр не показан.");
};
const findSource = async (database: Database, reference: Reference, signal?: AbortSignal) => {
  if (database.name !== reference.database || reference.key.type !== "string") throw new Error("Источник файловой версии не соответствует проверенному адресу.");
  const stores = database.stores.filter(store => store.name === reference.store);
  if (stores.length !== 1 || stores[0].records.length > BACKUP_LIMITS.records) throw new Error("Источник файловой версии недоступен, неоднозначен или превышает предел просмотра.");
  const store = stores[0], records: typeof store.records = [];
  for (const [index, record] of store.records.entries()) {
    if (index % 128 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); }
    if (record.key.type === "string" && record.key.value === reference.key.value) records.push(record);
  }
  if (records.length !== 1) throw new Error("Файловая запись отсутствует или неоднозначна. Проверьте архив заново.");
  return { database: database.name, version: database.version, store, ...records[0] };
};

/** Metadata is shown only on explicit request; this never marks binary contents or a file version reviewed. */
export async function readBackupFileMetadataPreview(archive: Database, browser: Database, difference: BackupDifference, signal?: AbortSignal): Promise<BackupRecordPreview> {
  try {
    checkBackupAbort(signal);
    if (!canPreviewBackupFileMetadata(difference)) throw new Error("Для этого различия просмотр файловых метаданных недоступен.");
    const a = await findSource(archive, difference.reference, signal), b = await findSource(browser, difference.reference, signal);
    const comparison = await compareBackupFileDifference(a, b, signal);
    if (comparison?.status !== "compared") throw new Error("Поддерживаемое различие файлов больше не подтверждено. Проверьте архив заново.");
    const before = readBackupFileMetadata(a), after = readBackupFileMetadata(b);
    const rows: BackupRecordPreview["rows"] = []; let bytes = 0;
    const add = (row: BackupRecordPreview["rows"][number]) => {
      bytes += JSON.stringify(row).length * 2;
      if (bytes + rows.length * 2 + 4 > MAX_PREVIEW_BYTES) throw new Error("Метаданные слишком велики для просмотра. Частичный текст не показан; сохраните исходный архив для отдельного разбора.");
      rows.push(row);
    };
    for (const field of BACKUP_FILE_FIELDS) if (field !== "content" && (before.has(field) || after.has(field))) {
      add({ field, label: LABELS[field], archive: display(before.get(field), field), browser: display(after.get(field), field) });
    }
    add({ field: "content", label: "Бинарное содержимое", archive: "Не показано", browser: comparison.fields.includes("content") ? "Отличается от архива; не показано" : "Совпадает с архивом; не показано" });
    checkBackupAbort(signal);
    return { reference: structuredClone(difference.reference), collectionLabel: "Метаданные файловых версий", rows, hasUnpreviewedFields: true, mode: "file-metadata", checkedAt: new Date().toISOString() };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось подготовить защищённый просмотр файловых метаданных:", error);
    throw error;
  }
}
