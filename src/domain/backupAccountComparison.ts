import { decodeAccountsDocument } from "./accounts";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const FIELDS = ["name", "login", "role", "status", "email", "scheduleName", "memberships", "studentGroupId", "enrollmentStatus", "studentRecord", "revision", "createdAt", "updatedAt"] as const;
export type AccountComparedField = typeof FIELDS[number] | "other";
export type BackupAccountComparison = BackupRecordComparison<AccountComparedField>;
const definition: BackupRecordDefinition<AccountComparedField> = {
  collection: "accounts", label: "Учётные записи", fields: FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-accounts-"),
  supportsKey: (key) => key === "bi-university-accounts-v1",
  decode: (raw) => decodeAccountsDocument(raw).accounts,
};

export const compareBackupAccountRecords = (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupAccountComparison> => compareBackupRecords(archive, browser, definition, signal);
export const assertCompleteAccountComparison = (review: BackupAccountComparison) => assertCompleteBackupRecordComparison(review, definition);
