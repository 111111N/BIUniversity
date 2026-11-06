import { decodeAccountsDocument, type AccountsDocument } from "./accounts";
import { assertCompleteBackupRecordComparison, BackupRecordDecodeError, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const FIELDS = ["name", "login", "role", "status", "email", "scheduleName", "memberships", "studentGroupId", "enrollmentStatus", "studentRecord", "revision", "createdAt", "updatedAt"] as const;
export type AccountComparedField = typeof FIELDS[number] | "other";
const HISTORY_FIELDS = ["accountId", "actorId", "occurredAt", "action", "previousRole", "nextRole", "previousMemberships", "nextMemberships", "changes", "importBatchId", "studentOperationBatchId", "educationEventId"] as const;
export type AccountHistoryComparedField = typeof HISTORY_FIELDS[number] | "other";
const EDUCATION_FIELDS = ["accountId", "actorId", "registeredAt", "accountRevisionAfter", "kind", "effectiveDate", "basis", "documentNumber", "documentDate", "before", "after", "auditId", "batchId"] as const;
export type EducationComparedField = typeof EDUCATION_FIELDS[number] | "other";
export interface BackupAccountComparison extends BackupRecordComparison<AccountComparedField> {
  historyComparisonVersion?: 1;
  history?: BackupRecordComparison<AccountHistoryComparedField>;
  educationComparisonVersion?: 1;
  education?: BackupRecordComparison<EducationComparedField>;
}
const definition = (read = decodeAccountsDocument): BackupRecordDefinition<AccountComparedField> => ({
  collection: "accounts", label: "Учётные записи", fields: FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-accounts-"),
  supportsKey: (key) => key === "bi-university-accounts-v1",
  decode: (raw) => read(raw).accounts,
});
const cards = definition();
const historyDefinition = (read = decodeAccountsDocument): BackupRecordDefinition<AccountHistoryComparedField> => ({
  collection: "account-history", label: "История учёток", fields: HISTORY_FIELDS,
  matchesKey: cards.matchesKey, supportsKey: cards.supportsKey,
  decode: (raw) => read(raw).history,
});
const history = historyDefinition();
const educationDefinition = (read = decodeAccountsDocument): BackupRecordDefinition<EducationComparedField> => ({
  collection: "education-events", label: "События обучения", fields: EDUCATION_FIELDS,
  matchesKey: cards.matchesKey, supportsKey: cards.supportsKey,
  decode: (raw) => {
    const events = read(raw).educationEvents;
    if (events === undefined) throw new BackupRecordDecodeError("missing-education-history");
    return events;
  },
});
const education = educationDefinition();

export const compareBackupAccountRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupAccountComparison> => {
  const snapshots = new Map<string, AccountsDocument | null>();
  const read: typeof decodeAccountsDocument = (raw) => {
    if (!snapshots.has(raw)) {
      try { snapshots.set(raw, decodeAccountsDocument(raw)); }
      catch { snapshots.set(raw, null); }
    }
    const snapshot = snapshots.get(raw);
    if (!snapshot) throw new Error("Не читается полная схема учёток и связанных событий.");
    return snapshot;
  };
  try {
    return {
      ...await compareBackupRecords(archive, browser, definition(read), signal),
      historyComparisonVersion: 1,
      history: await compareBackupRecords(archive, browser, historyDefinition(read), signal),
      educationComparisonVersion: 1,
      education: await compareBackupRecords(archive, browser, educationDefinition(read), signal),
    };
  } finally { snapshots.clear(); }
};
export const assertCompleteAccountComparison = (review: BackupAccountComparison) => {
  assertCompleteBackupRecordComparison(review, cards);
  if (review.historyComparisonVersion !== undefined || review.history !== undefined) {
    if (review.historyComparisonVersion !== 1 || !review.history) throw new Error("История учёток отсутствует или несовместима. Проверьте архив заново; неполный отчёт не скачан.");
    assertCompleteBackupRecordComparison(review.history, history);
  }
  if (review.educationComparisonVersion !== undefined || review.education !== undefined) {
    if (review.educationComparisonVersion !== 1 || !review.education) throw new Error("События обучения отсутствуют или несовместимы. Проверьте архив заново; неполный отчёт не скачан.");
    assertCompleteBackupRecordComparison(review.education, education);
  }
};
export const getUncheckedAccountDocuments = (review: BackupAccountComparison) => new Set([...review.uncompared, ...(review.history?.uncompared ?? []), ...(review.education?.uncompared ?? [])].map((item) => item.key)).size;
export const getAccountBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => [cards, history, education].find(item => item.collection === collection);
