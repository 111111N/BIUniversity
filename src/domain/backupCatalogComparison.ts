import { decodeGroupCatalog } from "./groupCatalog";
import { decodeSubjectCatalog } from "./subjectCatalog";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const GROUP_FIELDS = ["name", "course", "campus", "admissionYear", "status", "previousNames", "revision", "createdAt", "createdBy", "updatedAt", "source"] as const;
const SUBJECT_FIELDS = ["name", "shortName", "semester", "color"] as const;
export type GroupComparedField = typeof GROUP_FIELDS[number] | "other";
export type SubjectComparedField = typeof SUBJECT_FIELDS[number] | "other";
export interface BackupCatalogComparison { groups: BackupRecordComparison<GroupComparedField>; subjects: BackupRecordComparison<SubjectComparedField> }
const groups: BackupRecordDefinition<GroupComparedField> = {
  collection: "groups", label: "Группы", fields: GROUP_FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-group-catalog-"),
  supportsKey: (key) => key === "bi-university-group-catalog-v1",
  decode: (raw) => decodeGroupCatalog(raw).groups,
};
const subjects: BackupRecordDefinition<SubjectComparedField> = {
  collection: "subjects", label: "Дисциплины", fields: SUBJECT_FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-subject-catalog-"),
  supportsKey: (key) => key === "bi-university-subject-catalog-v1",
  decode: (raw) => decodeSubjectCatalog(raw).subjects,
};

export const compareBackupCatalogRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupCatalogComparison> => ({
  groups: await compareBackupRecords(archive, browser, groups, signal),
  subjects: await compareBackupRecords(archive, browser, subjects, signal),
});
export const assertCompleteCatalogComparison = (review: BackupCatalogComparison) => {
  assertCompleteBackupRecordComparison(review.groups, groups);
  assertCompleteBackupRecordComparison(review.subjects, subjects);
};
