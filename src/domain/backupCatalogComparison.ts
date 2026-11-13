import { decodeGroupCatalog } from "./groupCatalog";
import { decodeSubjectCatalog } from "./subjectCatalog";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const GROUP_FIELDS = ["name", "course", "campus", "admissionYear", "status", "previousNames", "revision", "createdAt", "createdBy", "updatedAt", "source"] as const;
const SUBJECT_FIELDS = ["name", "shortName", "semester", "color", "revision", "status", "previousNames"] as const;
export type GroupComparedField = typeof GROUP_FIELDS[number] | "other";
export type SubjectComparedField = typeof SUBJECT_FIELDS[number] | "other";
const GROUP_HISTORY_FIELDS = ["groupId", "actorId", "occurredAt", "action", "before", "after"] as const;
const SUBJECT_HISTORY_FIELDS = ["subjectId", "actorId", "occurredAt", "action", "before", "after", "origin"] as const;
export type GroupHistoryComparedField = typeof GROUP_HISTORY_FIELDS[number] | "other";
export type SubjectHistoryComparedField = typeof SUBJECT_HISTORY_FIELDS[number] | "other";
export interface BackupCatalogComparison {
  groups: BackupRecordComparison<GroupComparedField>; subjects: BackupRecordComparison<SubjectComparedField>;
  historyComparisonVersion?: 1;
  groupHistory?: BackupRecordComparison<GroupHistoryComparedField>;
  subjectHistory?: BackupRecordComparison<SubjectHistoryComparedField>;
}
const groupDefinition = (read = decodeGroupCatalog): BackupRecordDefinition<GroupComparedField> => ({
  collection: "groups", label: "Группы", fields: GROUP_FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-group-catalog-"),
  supportsKey: (key) => key === "bi-university-group-catalog-v1",
  decode: (raw) => read(raw).groups,
});
const subjectDefinition = (read = decodeSubjectCatalog): BackupRecordDefinition<SubjectComparedField> => ({
  collection: "subjects", label: "Дисциплины", fields: SUBJECT_FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-subject-catalog-"),
  supportsKey: (key) => key === "bi-university-subject-catalog-v1",
  decode: (raw) => read(raw).subjects,
});
const groups = groupDefinition(), subjects = subjectDefinition();
const groupHistoryDefinition = (read = decodeGroupCatalog): BackupRecordDefinition<GroupHistoryComparedField> => ({ collection: "group-history", label: "История групп", fields: GROUP_HISTORY_FIELDS, matchesKey: groups.matchesKey, supportsKey: groups.supportsKey, decode: (raw) => read(raw).history });
const subjectHistoryDefinition = (read = decodeSubjectCatalog): BackupRecordDefinition<SubjectHistoryComparedField> => ({ collection: "subject-history", label: "История дисциплин", fields: SUBJECT_HISTORY_FIELDS, matchesKey: subjects.matchesKey, supportsKey: subjects.supportsKey, decode: (raw) => read(raw).history });
const groupHistory = groupHistoryDefinition(), subjectHistory = subjectHistoryDefinition();
const cachedReader = <T,>(decode: (raw: string) => T) => {
  const values = new Map<string, T | null>();
  return {
    read: (raw: string): T => {
      if (!values.has(raw)) { try { values.set(raw, decode(raw)); } catch { values.set(raw, null); } }
      const value = values.get(raw);
      if (!value) throw new Error("Не читается полная схема каталога и его истории.");
      return value;
    },
    clear: () => values.clear(),
  };
};

export const compareBackupCatalogRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupCatalogComparison> => {
  const groupReader = cachedReader(decodeGroupCatalog), subjectReader = cachedReader(decodeSubjectCatalog);
  try {
    return {
      groups: await compareBackupRecords(archive, browser, groupDefinition(groupReader.read), signal),
      subjects: await compareBackupRecords(archive, browser, subjectDefinition(subjectReader.read), signal),
      historyComparisonVersion: 1,
      groupHistory: await compareBackupRecords(archive, browser, groupHistoryDefinition(groupReader.read), signal),
      subjectHistory: await compareBackupRecords(archive, browser, subjectHistoryDefinition(subjectReader.read), signal),
    };
  } finally { groupReader.clear(); subjectReader.clear(); }
};
export const assertCompleteCatalogComparison = (review: BackupCatalogComparison) => {
  assertCompleteBackupRecordComparison(review.groups, groups);
  assertCompleteBackupRecordComparison(review.subjects, subjects);
  if (review.historyComparisonVersion !== undefined || review.groupHistory !== undefined || review.subjectHistory !== undefined) {
    if (review.historyComparisonVersion !== 1 || !review.groupHistory || !review.subjectHistory) throw new Error("История каталогов отсутствует или несовместима. Проверьте архив заново; неполный отчёт не скачан.");
    assertCompleteBackupRecordComparison(review.groupHistory, groupHistory);
    assertCompleteBackupRecordComparison(review.subjectHistory, subjectHistory);
  }
};
export const getUncheckedCatalogDocuments = (review: BackupCatalogComparison) => new Set([review.groups, review.subjects, review.groupHistory, review.subjectHistory].flatMap(section => section?.uncompared.map(item => item.key) ?? [])).size;
export const getCatalogBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => [groups, subjects, groupHistory, subjectHistory].find(item => item.collection === collection);
