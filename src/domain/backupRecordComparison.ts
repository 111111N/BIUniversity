import { BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue, type AdministrativeBackup, type BackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import { getBackupDifferenceKey, type BackupDifference, type BackupDifferenceReference } from "./backupComparison";

export interface BackupRecordDifference<Field extends string> extends BackupDifference { fields: (Field | "other")[] }
export interface BackupUncomparedDocument { key: string; source: "archive" | "browser"; reason: "unsupported-key" | "duplicate-key" | "invalid-document" | "missing-history" | "missing-education-history" | "unresolved-journal-area" | "unresolved-notification-source" }
export class BackupRecordDecodeError extends Error {
  constructor(public readonly reason: "missing-history" | "missing-education-history" | "unresolved-journal-area" | "unresolved-notification-source") { super("Источник записей или его связи не подтверждены."); }
}
export interface BackupRecordComparison<Field extends string> {
  counts: { documents: number; comparedDocuments: number; uncheckedDocuments: number; same: number; new: number; different: number; currentOnly: number };
  differences: BackupRecordDifference<Field>[];
  uncompared: BackupUncomparedDocument[];
}
interface BackupRecordDefinitionBase<Field extends string> {
  label: string; fields: readonly Field[];
  matchesKey(key: string): boolean;
  supportsKey(key: string): boolean;
  decode(raw: string, key: string, source: BackupUncomparedDocument["source"]): readonly object[];
  errors?: Partial<typeof DEFAULT_ERRORS>;
}
export type BackupRecordDefinition<Field extends string> = BackupRecordDefinitionBase<Field> & (
  | { collection: Extract<BackupDifferenceReference, { storage: "localStorage-record" }>["collection"] }
  | { collection: "submission-attempts"; parentId(row: object): string; project(row: object): object }
  | { collection: "schedule-journal"; scope(row: object): { subjectId: string; groupId: string } }
);
const DEFAULT_ERRORS = {
  text: "Локальные документы превышают лимит сравнения 16 МиБ. Частичный результат не создан.",
  records: "В локальных документах больше 25 000 записей. Частичный результат сравнения не создан.",
  output: "Результат сравнения записей превышает лимит 16 МиБ. Частичный результат не создан.",
  incomplete: "В результате сравнения записей отсутствует часть данных. Проверьте архив заново; неполный отчёт не скачан.",
};
const DECODE_REASONS: Partial<Record<BackupRecordDefinition<string>["collection"], BackupUncomparedDocument["reason"]>> = { "submission-attempts": "missing-history", "education-events": "missing-education-history", "journal-history": "unresolved-journal-area", notifications: "unresolved-notification-source" };
export type BackupRecordEntries = readonly AdministrativeBackup["localStorage"][number][];
type EncodedObject = Extract<BackupValue, { type: "object" }>;
interface ComparedRecord { id: string; parentId?: string; scope?: { subjectId: string; groupId: string }; value: EncodedObject }
const encoded = (value?: BackupValue) => value ? canonicalBackupValue(value) : "missing";
const changedFields = <Field extends string>(archive: EncodedObject, browser: EncodedObject, known: readonly Field[]): (Field | "other")[] => {
  const a = new Map(archive.entries), b = new Map(browser.entries);
  const fields: (Field | "other")[] = known.filter((field) => encoded(a.get(field)) !== encoded(b.get(field)));
  const extras = (value: EncodedObject): EncodedObject => ({ type: "object", entries: value.entries.filter(([key]) => key !== "id" && !(known as readonly string[]).includes(key)) });
  if (canonicalBackupValue(extras(archive)) !== canonicalBackupValue(extras(browser))) fields.push("other");
  return fields;
};

/** Adapters validate stored rows without normalizing or supplying missing live/default data. */
export const compareBackupRecords = async <Field extends string>(archived: BackupRecordEntries, current: BackupRecordEntries, definition: BackupRecordDefinition<Field>, signal?: AbortSignal): Promise<BackupRecordComparison<Field>> => {
  const errors = { ...DEFAULT_ERRORS, ...definition.errors };
  let steps = 0;
  const checkpoint = async () => { if (++steps % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const index = async (entries: BackupRecordEntries) => {
    const result = new Map<string, string[]>(); let bytes = 0;
    for (const entry of entries) {
      await checkpoint(); if (!definition.matchesKey(entry.key)) continue;
      bytes += (entry.key.length + entry.raw.length) * 2;
      if (bytes > BACKUP_LIMITS.textBytes) throw new Error(errors.text);
      const rows = result.get(entry.key) ?? []; rows.push(entry.raw); result.set(entry.key, rows);
    }
    return result;
  };
  const archive = await index(archived), browser = await index(current);
  const keys = [...new Set([...archive.keys(), ...browser.keys()])].sort();
  const review: BackupRecordComparison<Field> = { counts: { documents: keys.length, comparedDocuments: 0, uncheckedDocuments: 0, same: 0, new: 0, different: 0, currentOnly: 0 }, differences: [], uncompared: [] };
  let resultBytes = 0;
  const chargeResult = (value: BackupRecordDifference<Field> | BackupUncomparedDocument) => {
    resultBytes += JSON.stringify(value).length * 2;
    if (resultBytes > BACKUP_LIMITS.textBytes) throw new Error(errors.output);
  };
  const budgets = { archive: createBackupBudget(), browser: createBackupBudget() };
  const read = async (key: string, raws: string[] | undefined, source: BackupUncomparedDocument["source"]) => {
    const records = new Map<string, ComparedRecord>(); if (!raws) return records;
    const reject = (reason: BackupUncomparedDocument["reason"]) => { const item = { key, source, reason }; chargeResult(item); review.uncompared.push(item); return null; };
    if (raws.length !== 1) return reject("duplicate-key");
    if (!definition.supportsKey(key)) return reject("unsupported-key");
    let rows: readonly object[];
    try { rows = definition.decode(raws[0], key, source); }
    catch (error) { return reject(error instanceof BackupRecordDecodeError && DECODE_REASONS[definition.collection] === error.reason ? error.reason : "invalid-document"); }
    if (!Array.isArray(rows)) return reject("invalid-document");
    for (const row of rows) {
      await checkpoint(); const budget = budgets[source];
      if (++budget.records > BACKUP_LIMITS.records) throw new Error(errors.records);
      if (!row || typeof row !== "object" || Array.isArray(row)) return reject("invalid-document");
      const id = "id" in row ? row.id : undefined;
      if (typeof id !== "string" || !id) return reject("invalid-document");
      const parentId = definition.collection === "submission-attempts" ? definition.parentId(row) : undefined;
      if (definition.collection === "submission-attempts" && (typeof parentId !== "string" || !parentId)) return reject("invalid-document");
      const scope = definition.collection === "schedule-journal" ? definition.scope(row) : undefined;
      if (definition.collection === "schedule-journal" && (!scope || typeof scope.subjectId !== "string" || !scope.subjectId.trim() || typeof scope.groupId !== "string" || !scope.groupId.trim())) return reject("invalid-document");
      const identity = scope ? JSON.stringify([id, scope.subjectId, scope.groupId]) : parentId === undefined ? id : JSON.stringify([parentId, id]);
      if (records.has(identity)) return reject("invalid-document");
      const payload = definition.collection === "submission-attempts" ? definition.project(row) : row;
      if (!payload || typeof payload !== "object" || !("id" in payload) || payload.id !== id) return reject("invalid-document");
      const value = await encodeBackupValue(payload, budget, signal);
      if (value.type !== "object") throw new Error("Не удалось прочитать структуру записи при сравнении.");
      records.set(identity, { id, parentId, scope, value });
    }
    return records;
  };
  for (const key of keys) {
    await checkpoint();
    const a = await read(key, archive.get(key), "archive"), b = await read(key, browser.get(key), "browser");
    if (!a || !b) { review.counts.uncheckedDocuments++; continue; }
    review.counts.comparedDocuments++;
    for (const identity of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      await checkpoint(); const before = a.get(identity), after = b.get(identity);
      if (before && after && canonicalBackupValue(before.value) === canonicalBackupValue(after.value)) { review.counts.same++; continue; }
      const kind = !before ? "current-only" : !after ? "new" : "different";
      review.counts[kind === "current-only" ? "currentOnly" : kind]++;
      const record = before ?? after!;
      const reference: BackupDifferenceReference = definition.collection === "submission-attempts"
        ? { storage: "localStorage-child-record", key, collection: definition.collection, parentId: record.parentId!, id: record.id }
        : definition.collection === "schedule-journal"
        ? { storage: "localStorage-journal-record", key, collection: definition.collection, subjectId: record.scope!.subjectId, groupId: record.scope!.groupId, id: record.id }
        : { storage: "localStorage-record", key, collection: definition.collection, id: record.id };
      const item: BackupRecordDifference<Field> = { kind, area: `${definition.label} · ${key}`, id: record.id, reference, fields: before && after ? changedFields(before.value, after.value, definition.fields) : [] };
      chargeResult(item); review.differences.push(item);
    }
  }
  checkBackupAbort(signal); return review;
};

export const assertCompleteBackupRecordComparison = <Field extends string>(review: BackupRecordComparison<Field>, definition: BackupRecordDefinition<Field>) => {
  const fail = (): never => { throw new Error(definition.errors?.incomplete ?? DEFAULT_ERRORS.incomplete); };
  if (!review?.counts || !Array.isArray(review.differences) || !Array.isArray(review.uncompared)) fail();
  const counts = review.counts;
  const countKeys = ["documents", "comparedDocuments", "uncheckedDocuments", "same", "new", "different", "currentOnly"] as const;
  const uncheckedKeys = new Set(review.uncompared.map((item) => item.key));
  const validReference = (item: BackupRecordDifference<Field>) => {
    const reference = item.reference;
    if (!reference || (reference.storage !== "localStorage-record" && reference.storage !== "localStorage-child-record" && reference.storage !== "localStorage-journal-record")) return false;
    if (definition.collection === "submission-attempts") {
      if (reference.storage !== "localStorage-child-record" || typeof reference.parentId !== "string" || !reference.parentId) return false;
    } else if (definition.collection === "schedule-journal") {
      if (reference.storage !== "localStorage-journal-record" || typeof reference.subjectId !== "string" || !reference.subjectId.trim() || typeof reference.groupId !== "string" || !reference.groupId.trim()) return false;
    } else if (reference.storage !== "localStorage-record") return false;
    return reference.collection === definition.collection && reference.id === item.id && definition.supportsKey(reference.key) && !uncheckedKeys.has(reference.key);
  };
  const valid = countKeys.every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
    && counts.documents === counts.comparedDocuments + counts.uncheckedDocuments
    && uncheckedKeys.size === counts.uncheckedDocuments
    && review.differences.filter((item) => item.kind === "new").length === counts.new
    && review.differences.filter((item) => item.kind === "different").length === counts.different
    && review.differences.filter((item) => item.kind === "current-only").length === counts.currentOnly
    && review.differences.length === counts.new + counts.different + counts.currentOnly
    && review.differences.every((item) => item.fileDifference === undefined && validReference(item)
      && Array.isArray(item.fields) && new Set(item.fields).size === item.fields.length
      && item.fields.every((field) => field === "other" || (definition.fields as readonly string[]).includes(field))
      && (item.kind === "different" ? item.fields.length > 0 : item.fields.length === 0))
    && new Set(review.differences.map((item) => getBackupDifferenceKey({ ...item, kind: "different" }))).size === review.differences.length
    && review.uncompared.every((item) => definition.matchesKey(item.key) && ["archive", "browser"].includes(item.source) && (["unsupported-key", "duplicate-key", "invalid-document"].includes(item.reason) || DECODE_REASONS[definition.collection] === item.reason))
    && new Set(review.uncompared.map((item) => JSON.stringify([item.key, item.source]))).size === review.uncompared.length;
  if (!valid) fail();
};
