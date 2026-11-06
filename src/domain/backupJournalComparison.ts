import { BACKUP_JOURNAL_DOCUMENTS, decodeBackupJournalHistory } from "./backupJournalDocuments";
import { decodeGroupCatalog } from "./groupCatalog";
import { decodeSubjectCatalog } from "./subjectCatalog";
import { resolveJournalTeachingArea } from "./journalTeachingArea";
import { getJournalHistoryValueIssues } from "./journalHistoryValues";
import { BACKUP_LIMITS, checkBackupAbort } from "./localBackup";
import { assertCompleteBackupRecordComparison, BackupRecordDecodeError, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const FIELDS = ["changedAt", "actor", "studentId", "studentName", "lessonId", "field", "previousValue", "nextValue"] as const;
export type JournalHistoryComparedField = typeof FIELDS[number] | "other";
export type BackupJournalComparison = BackupRecordComparison<JournalHistoryComparedField>;
const document = BACKUP_JOURNAL_DOCUMENTS.journalHistory;
const definition: BackupRecordDefinition<JournalHistoryComparedField> = {
  collection: "journal-history", label: "История журнала", fields: FIELDS,
  matchesKey: key => key.startsWith(document.prefix), supportsKey: key => key.startsWith(document.key) && Boolean(key.slice(document.key.length)),
  decode: raw => {
    const rows = decodeBackupJournalHistory(raw);
    if (rows.some(row => getJournalHistoryValueIssues(row).some(issue => issue.level === "error"))) throw new Error("Значения истории журнала противоречат типу события.");
    return rows;
  },
};
const indexAreas = async (entries: BackupRecordEntries, signal?: AbortSignal) => {
  const sources = new Map<string, string[]>(); let bytes = 0, steps = 0;
  for (const entry of entries) {
    if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    if (!definition.matchesKey(entry.key) && entry.key !== "bi-university-group-catalog-v1" && entry.key !== "bi-university-subject-catalog-v1") continue;
    bytes += (entry.key.length + entry.raw.length) * 2;
    if (bytes > BACKUP_LIMITS.textBytes || sources.size >= BACKUP_LIMITS.records) throw new Error("Источники областей журнала превышают лимиты сравнения. Частичный результат не создан.");
    const rows = sources.get(entry.key) ?? []; rows.push(entry.raw); sources.set(entry.key, rows);
  }
  const read = <T,>(key: string, decode: (raw: string) => T): T | undefined => {
    const values = sources.get(key); if (values?.length !== 1) return undefined;
    try { return decode(values[0]); } catch { return undefined; }
  };
  const groups = read("bi-university-group-catalog-v1", decodeGroupCatalog), subjects = read("bi-university-subject-catalog-v1", decodeSubjectCatalog);
  const catalogs = { groupIds: groups ? new Set(groups.groups.map(row => row.id)) : undefined, subjectIds: subjects ? new Set(subjects.subjects.map(row => row.id)) : undefined };
  const areas = new Map<string, string | null>();
  for (const key of sources.keys()) {
    if (!definition.supportsKey(key)) continue;
    const area = await resolveJournalTeachingArea(key.slice(document.key.length), catalogs, signal);
    areas.set(key, area.status === "matched" ? JSON.stringify([area.subjectId, area.groupId]) : null);
  }
  return areas;
};
export const compareBackupJournalRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupJournalComparison> => {
  const areas = { archive: await indexAreas(archive, signal), browser: await indexAreas(browser, signal) };
  return compareBackupRecords(archive, browser, {
    ...definition,
    decode: (raw, key, source) => {
      const own = areas[source].get(key), other = areas[source === "archive" ? "browser" : "archive"];
      if (!own || (other.has(key) && other.get(key) !== own)) throw new BackupRecordDecodeError("unresolved-journal-area");
      return definition.decode(raw, key, source);
    },
  }, signal);
};
export const assertCompleteJournalComparison = (review: BackupJournalComparison) => assertCompleteBackupRecordComparison(review, definition);
export const getJournalBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => collection === definition.collection ? definition : undefined;
