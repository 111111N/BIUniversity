import { decodeManagedSchedule, MANAGED_SCHEDULE_KEY, type ManagedJournalEntry } from "./scheduleManagement";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const FIELDS = ["scheduleId", "subjectId", "groupId", "teacherId", "teacherName", "date", "startsAt", "endsAt", "type", "room"] as const;
export type ScheduleComparedField = typeof FIELDS[number] | "other";
export type ScheduleJournalComparedField = ScheduleComparedField | "journalState";
export interface BackupScheduleComparison { drafts: BackupRecordComparison<ScheduleComparedField>; published: BackupRecordComparison<ScheduleComparedField>; journalComparisonVersion?: 1; journal?: BackupRecordComparison<ScheduleJournalComparedField> }
const readSchedule = (raw: string) => {
  const snapshot = decodeManagedSchedule(raw);
  if (!snapshot) throw new Error("Не читается полная схема расписания или его связь с журналом.");
  return snapshot;
};
const definition = (mode: "drafts" | "published", read = readSchedule): BackupRecordDefinition<ScheduleComparedField> => ({
  collection: mode === "drafts" ? "schedule-drafts" : "schedule-published",
  label: mode === "drafts" ? "Пары черновика" : "Опубликованные пары", fields: FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-managed-schedule-"),
  supportsKey: (key) => key === MANAGED_SCHEDULE_KEY,
  decode: (raw) => read(raw)[mode].flatMap((week) => week.lessons),
});
const drafts = definition("drafts"), published = definition("published");
const journalDefinition = (read = readSchedule): BackupRecordDefinition<ScheduleJournalComparedField> => ({
  collection: "schedule-journal", label: "Связи занятий с журналом", fields: [...FIELDS, "journalState"],
  matchesKey: drafts.matchesKey, supportsKey: drafts.supportsKey,
  decode: (raw) => read(raw).journal,
  scope: (row) => ({ subjectId: (row as ManagedJournalEntry).subjectId, groupId: (row as ManagedJournalEntry).groupId }),
});
const journal = journalDefinition();

export const compareBackupScheduleRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupScheduleComparison> => {
  const snapshots = new Map<string, ReturnType<typeof decodeManagedSchedule>>();
  const read: typeof readSchedule = (raw) => {
    if (!snapshots.has(raw)) snapshots.set(raw, decodeManagedSchedule(raw));
    const snapshot = snapshots.get(raw);
    if (!snapshot) throw new Error("Не читается полная схема расписания или его связь с журналом.");
    return snapshot;
  };
  try {
    return {
      drafts: await compareBackupRecords(archive, browser, definition("drafts", read), signal),
      published: await compareBackupRecords(archive, browser, definition("published", read), signal),
      journalComparisonVersion: 1,
      journal: await compareBackupRecords(archive, browser, journalDefinition(read), signal),
    };
  } finally { snapshots.clear(); }
};
export const assertCompleteScheduleComparison = (review: BackupScheduleComparison) => {
  assertCompleteBackupRecordComparison(review.drafts, drafts);
  assertCompleteBackupRecordComparison(review.published, published);
  if (review.journalComparisonVersion !== undefined || review.journal !== undefined) {
    if (review.journalComparisonVersion !== 1 || !review.journal) throw new Error("Раздел связей журнала отсутствует или несовместим. Проверьте архив заново; неполный отчёт не скачан.");
    assertCompleteBackupRecordComparison(review.journal, journal);
  }
};
export const getUncheckedScheduleDocuments = (review: BackupScheduleComparison) => new Set([...review.drafts.uncompared, ...review.published.uncompared, ...(review.journal?.uncompared ?? [])].map((item) => item.key)).size;
export const getScheduleBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => [drafts, published, journal].find(item => item.collection === collection);
