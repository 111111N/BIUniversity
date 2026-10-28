export const BACKUP_DATABASES = [
  { name: "bi-university-cabinet", store: "teacher-files" },
  { name: "bi-university-message-files", store: "attachments" },
  { name: "bi-university-learning-files", store: "files" },
] as const;

export const BACKUP_LIMITS = { binaryBytes: 64 * 1024 * 1024, textBytes: 16 * 1024 * 1024, records: 25_000, nodes: 500_000, archiveBytes: 128 * 1024 * 1024 };
export type BackupValue =
  | { type: "null" | "undefined" }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "date"; value: string }
  | { type: "array"; value: BackupValue[] }
  | { type: "object"; entries: [string, BackupValue][] }
  | { type: "blob"; base64: string; size: number; mediaType: string; file?: { name: string; lastModified: number } };

export interface BackupBudget { binaryBytes: number; textBytes: number; records: number; nodes: number; files: number }
export const createBackupBudget = (): BackupBudget => ({ binaryBytes: 0, textBytes: 0, records: 0, nodes: 0, files: 0 });
export const isPortalStorageKey = (key: string) => key.startsWith("bi-university-");
export const addBackupText = (budget: BackupBudget, value: string) => {
  budget.textBytes += value.length * 2;
  if (budget.textBytes > BACKUP_LIMITS.textBytes) throw new Error("Текстовые данные превышают лимит выгрузки 16 МиБ. Архив не создан.");
};
export const checkBackupAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Выгрузка отменена", "AbortError");
};

// Tagged values preserve Blob/File metadata, undefined and object keys without JSON coercion.
export async function encodeBackupValue(value: unknown, budget: BackupBudget, signal?: AbortSignal, depth = 0): Promise<BackupValue> {
  checkBackupAbort(signal);
  if (++budget.nodes > BACKUP_LIMITS.nodes || depth > 32) throw new Error("Структура данных слишком велика или несовместима с форматом выгрузки.");
  if (value === null) return { type: "null" };
  if (value === undefined) return { type: "undefined" };
  if (typeof value === "string") { addBackupText(budget, value); return { type: "string", value }; }
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "number" && Number.isFinite(value)) return { type: "number", value };
  if (value instanceof Date && Number.isFinite(value.getTime())) return { type: "date", value: value.toISOString() };
  if (value instanceof Blob) {
    budget.binaryBytes += value.size;
    if (budget.binaryBytes > BACKUP_LIMITS.binaryBytes) throw new Error("Вложения превышают лимит выгрузки 64 МиБ. Частичный архив не создаётся.");
    budget.files++;
    const bytes = new Uint8Array(await value.arrayBuffer());
    checkBackupAbort(signal);
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 32_768) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
    const file = typeof File !== "undefined" && value instanceof File ? { name: value.name, lastModified: value.lastModified } : undefined;
    return { type: "blob", base64: btoa(chunks.join("")), size: value.size, mediaType: value.type, ...(file ? { file } : {}) };
  }
  if (Array.isArray(value)) {
    const result: BackupValue[] = [];
    for (const item of value) result.push(await encodeBackupValue(item, budget, signal, depth + 1));
    return { type: "array", value: result };
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries: [string, BackupValue][] = [];
    for (const [key, item] of Object.entries(value)) { addBackupText(budget, key); entries.push([key, await encodeBackupValue(item, budget, signal, depth + 1)]); }
    return { type: "object", entries };
  }
  throw new Error("Обнаружен неподдерживаемый тип данных. Выгрузка остановлена без частичного архива.");
}

export interface BackupStoreMetadata {
  name: string; keyPath: string | string[] | null; autoIncrement: boolean;
  indexes: { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }[];
}
export interface RawBackupDatabase {
  name: string; version: number | null; capturedAt: string;
  stores: (BackupStoreMetadata & { records: { key: IDBCursor["primaryKey"]; value: unknown }[] })[];
}
export interface AdministrativeBackup {
  format: "bi-university-local-backup"; version: 1; scope: "administrative";
  startedAt: string; completedAt: string; actor: { id: string; revision: number };
  source: { origin: string; basePath: string };
  consistency: "per-database-readonly-transaction";
  exclusions: string[];
  localStorage: { key: string; raw: string }[];
  databases: (Omit<RawBackupDatabase, "stores"> & { stores: (BackupStoreMetadata & { records: { key: BackupValue; value: BackupValue }[] })[] })[];
  totals: { storageEntries: number; databaseRecords: number; files: number; binaryBytes: number };
}
