import { BACKUP_LIMITS, checkBackupAbort, type BackupStoreMetadata, type BackupValue } from "./localBackup";
import type { BackupDifference } from "./backupComparison";
import { assertBackupMaterialAreaComparison, type BackupMaterialAreaComparison } from "./backupMaterialArea";

export const BACKUP_FILE_FIELDS = ["name", "type", "size", "createdAt", "scope", "category", "uploadedBy", "description", "pinned", "fileName", "lastModified", "content"] as const;
export type BackupFileField = typeof BACKUP_FILE_FIELDS[number];
type Source = "archive" | "browser";
type Reason = "unsupported-store" | "invalid-record" | "unknown-fields";
export interface BackupFileDifferenceDetails {
  version: 1;
  status: "compared" | "partial" | "uncompared";
  fields: BackupFileField[];
  issues: { source: Source; reason: Reason }[];
  ownership: "unverified";
  materialArea?: BackupMaterialAreaComparison;
}
interface FileSource { database: string; version: number | null; store: BackupStoreMetadata; key: BackupValue; value: BackupValue }
type Kind = "material" | "message" | "learning";
type SavedBlob = Extract<BackupValue, { type: "blob" }>;
const kindOf = (database: string, store: string): Kind | undefined => database === "bi-university-cabinet" && store === "teacher-files" ? "material"
  : database === "bi-university-message-files" && store === "attachments" ? "message"
  : database === "bi-university-learning-files" && store === "files" ? "learning" : undefined;
const supported = (source: FileSource, kind: Kind) => {
  const store = source.store;
  if (store.autoIncrement) return false;
  if (kind === "learning") return source.version === 1 && store.keyPath === null && store.indexes.length === 0;
  if (store.keyPath !== "id") return false;
  if (kind === "message") return source.version === 1 && store.indexes.length === 0;
  if (source.version !== 1 && source.version !== 2) return false;
  if (store.indexes.length > 1) return false;
  const index = store.indexes[0];
  return index ? index.name === "scope" && index.keyPath === "scope" && !index.unique && !index.multiEntry : source.version === 1;
};
const string = (node?: BackupValue) => node?.type === "string" ? node.value : undefined;
const number = (node?: BackupValue) => node?.type === "number" ? node.value : undefined;
const read = (source: FileSource, kind: Kind) => {
  if (source.key.type !== "string" || !source.key.value.trim()) return undefined;
  const value = source.value;
  const metadata = new Map<string, BackupValue>(); let unknown = false;
  let blob: BackupValue | undefined;
  if (kind === "learning") blob = value;
  else {
    if (value.type !== "object") return undefined;
    const fields = new Map(value.entries);
    if (fields.size !== value.entries.length || string(fields.get("id")) !== source.key.value) return undefined;
    const name = string(fields.get("name")), type = string(fields.get("type")), size = number(fields.get("size"));
    if (name === undefined || type === undefined || size === undefined || !Number.isSafeInteger(size) || size < 0) return undefined;
    if (kind === "message" && !string(fields.get("scope"))?.trim()) return undefined;
    if (kind === "material") {
      const createdAt = number(fields.get("createdAt"));
      if (createdAt === undefined || !Number.isFinite(new Date(createdAt).getTime())) return undefined;
      if (["scope", "category", "uploadedBy", "description"].some(key => fields.has(key) && !["undefined", "string"].includes(fields.get(key)!.type))) return undefined;
      const pinned = fields.get("pinned"); if (pinned && !["undefined", "boolean"].includes(pinned.type)) return undefined;
    }
    const allowed = kind === "material" ? ["id", "blob", "name", "type", "size", "createdAt", "scope", "category", "uploadedBy", "description", "pinned"] : ["id", "blob", "name", "type", "size", "scope"];
    unknown = [...fields.keys()].some(key => !allowed.includes(key));
    for (const key of allowed) if (key !== "id" && key !== "blob" && fields.has(key)) metadata.set(key, fields.get(key)!);
    blob = fields.get("blob");
  }
  if (blob?.type !== "blob" || !Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > BACKUP_LIMITS.binaryBytes || typeof blob.base64 !== "string"
    || blob.base64.length !== 4 * Math.ceil(blob.size / 3) || typeof blob.mediaType !== "string") return undefined;
  if (blob.file && (typeof blob.file.name !== "string" || !Number.isSafeInteger(blob.file.lastModified))) return undefined;
  if (kind === "learning") {
    metadata.set("type", { type: "string", value: blob.mediaType }); metadata.set("size", { type: "number", value: blob.size });
  } else if (number(metadata.get("size")) !== blob.size || string(metadata.get("type")) !== blob.mediaType || (blob.file && string(metadata.get("name")) !== blob.file.name)) return undefined;
  if (blob.file) {
    metadata.set("fileName", { type: "string", value: blob.file.name }); metadata.set("lastModified", { type: "number", value: blob.file.lastModified });
  }
  return { metadata, blob, unknown };
};
const sameScalar = (a?: BackupValue, b?: BackupValue) => a === undefined || b === undefined ? a === b
  : a.type === b.type && (a.type === "undefined" || ("value" in a && "value" in b && a.value === b.value));
const sameContent = async (a: SavedBlob, b: SavedBlob, signal?: AbortSignal) => {
  if (a.base64.length !== b.base64.length) return false;
  for (let offset = 0; offset < a.base64.length; offset += 65_536) {
    if (offset % 1_048_576 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); }
    if (a.base64.slice(offset, offset + 65_536) !== b.base64.slice(offset, offset + 65_536)) return false;
  }
  return true;
};

/** Inputs are already validated tagged values. Bytes stay encoded and never enter the result. */
export async function compareBackupFileDifference(archive: FileSource, browser: FileSource, signal?: AbortSignal): Promise<BackupFileDifferenceDetails | undefined> {
  checkBackupAbort(signal);
  const kind = kindOf(archive.database, archive.store.name);
  if (!kind || archive.database !== browser.database || archive.store.name !== browser.store.name) return undefined;
  const result: BackupFileDifferenceDetails = { version: 1, status: "compared", fields: [], issues: [], ownership: "unverified" };
  const records = new Map<Source, NonNullable<ReturnType<typeof read>>>();
  for (const [source, input] of [["archive", archive], ["browser", browser]] as const) {
    if (!supported(input, kind)) result.issues.push({ source, reason: "unsupported-store" });
    else {
      const record = read(input, kind);
      if (!record || input.key.type !== "string" || archive.key.type !== "string" || input.key.value !== archive.key.value) result.issues.push({ source, reason: "invalid-record" });
      else { records.set(source, record); if (record.unknown) result.issues.push({ source, reason: "unknown-fields" }); }
    }
  }
  if (records.size !== 2) return { ...result, status: "uncompared" };
  const a = records.get("archive")!, b = records.get("browser")!;
  result.fields = BACKUP_FILE_FIELDS.filter(field => field !== "content" && !sameScalar(a.metadata.get(field), b.metadata.get(field)));
  if (!await sameContent(a.blob, b.blob, signal)) result.fields.push("content");
  if (result.issues.length) result.status = "partial";
  checkBackupAbort(signal);
  return result.fields.length || result.issues.length ? result : undefined;
}

/** Keep downloadable reports free from accidental metadata values or binary payloads. */
export function assertBackupFileDifferenceDetails(difference: BackupDifference) {
  const detail = difference.fileDifference; if (detail === undefined) return;
  const fail = (): never => { throw new Error("Сведения о различиях файлов неполны или несовместимы. Проверьте архив заново; неполный отчёт не скачан."); };
  const ref = difference.reference;
  if (!detail || difference.kind !== "different" || ref?.storage !== "indexedDB" || !kindOf(ref.database, ref.store)
    || Object.keys(detail).some(key => !["version", "status", "fields", "issues", "ownership", "materialArea"].includes(key))
    || detail.version !== 1 || detail.ownership !== "unverified" || !Array.isArray(detail.fields) || !Array.isArray(detail.issues)
    || Array.from(detail.fields).some(field => !BACKUP_FILE_FIELDS.includes(field)) || new Set(detail.fields).size !== detail.fields.length
    || (detail.status !== "uncompared" && (ref.key.type !== "string" || !ref.key.value.trim()))
    || detail.issues.length > 2 || Array.from(detail.issues).some(issue => !issue || Object.keys(issue).some(key => !["source", "reason"].includes(key))
      || !["archive", "browser"].includes(issue.source) || !["unsupported-store", "invalid-record", "unknown-fields"].includes(issue.reason))
    || new Set(detail.issues.map(issue => issue.source)).size !== detail.issues.length) fail();
  if (detail.status === "compared" ? detail.issues.length !== 0 || detail.fields.length === 0
    : detail.status === "partial" ? detail.issues.length === 0 || detail.issues.some(issue => issue.reason !== "unknown-fields")
    : detail.status === "uncompared" ? detail.fields.length !== 0 || !detail.issues.some(issue => issue.reason !== "unknown-fields") : true) fail();
  if (detail.materialArea !== undefined) {
    if (ref?.storage !== "indexedDB" || kindOf(ref.database, ref.store) !== "material") fail();
    assertBackupMaterialAreaComparison(detail.materialArea);
    if (detail.issues.some(issue => issue.reason !== "unknown-fields" && detail.materialArea![issue.source].status !== "unavailable-record")) fail();
  }
}
