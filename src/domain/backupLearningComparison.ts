import { decodeBackupAssignments, decodeBackupSubmissions } from "./assignmentStorage";
import { getSubmissionConsistencyIssues } from "./submissionConsistency";
import { assertCompleteBackupRecordComparison, BackupRecordDecodeError, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const ASSIGNMENT_FIELDS = ["subjectId", "groupId", "subject", "group", "lessonDate", "lessonType", "title", "description", "deadline", "attachmentId", "attachmentName", "status", "allowLateSubmissions", "createdAt", "updatedAt"] as const;
const SUBMISSION_FIELDS = ["assignmentId", "studentId", "studentName", "sentAt", "text", "attachmentId", "attachmentName", "comment", "grade", "teacherComment", "status", "updatedAt", "attemptCount", "attempts"] as const;
const ATTEMPT_FIELDS = ["number", "sentAt", "updatedAt", "text", "attachmentId", "attachmentName", "status", "submittedLate", "teacherComment", "grade", "reviewedAt"] as const;
export type AssignmentComparedField = typeof ASSIGNMENT_FIELDS[number] | "other";
export type SubmissionComparedField = typeof SUBMISSION_FIELDS[number] | "other";
export type AttemptComparedField = typeof ATTEMPT_FIELDS[number] | "other";
export interface BackupLearningComparison { assignments: BackupRecordComparison<AssignmentComparedField>; submissions: BackupRecordComparison<SubmissionComparedField>; attemptComparisonVersion?: 1; attempts?: BackupRecordComparison<AttemptComparedField> }
const readComparableSubmissions = (raw: string) => {
  const rows = decodeBackupSubmissions(raw);
  if (rows.some((row) => getSubmissionConsistencyIssues(row).some((issue) => issue.level === "error"))) throw new Error("Карточка ответа противоречит истории попыток. Сравнение не выбирает источник верных значений.");
  return rows;
};
const assignments: BackupRecordDefinition<AssignmentComparedField> = {
  collection: "assignments", label: "Задания", fields: ASSIGNMENT_FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-demo-assignments"),
  supportsKey: (key) => key === "bi-university-demo-assignments",
  decode: decodeBackupAssignments,
};
const submissions: BackupRecordDefinition<SubmissionComparedField> = {
  collection: "submissions", label: "Ответы", fields: SUBMISSION_FIELDS,
  matchesKey: (key) => key.startsWith("bi-university-demo-submissions"),
  supportsKey: (key) => key === "bi-university-demo-submissions",
  decode: readComparableSubmissions,
};
type ScopedAttempt = { id: string; parentId: string; value: object };
const attempts: BackupRecordDefinition<AttemptComparedField> = {
  collection: "submission-attempts", label: "Попытки ответов", fields: ATTEMPT_FIELDS,
  matchesKey: submissions.matchesKey, supportsKey: submissions.supportsKey,
  decode: (raw) => {
    const rows = readComparableSubmissions(raw);
    if (rows.some((row) => !row.attempts?.length)) throw new BackupRecordDecodeError("missing-history");
    return rows.flatMap((row) => row.attempts!.map((attempt): ScopedAttempt => ({ id: attempt.id, parentId: row.id, value: attempt })));
  },
  parentId: (row) => (row as ScopedAttempt).parentId,
  project: (row) => (row as ScopedAttempt).value,
};

export const compareBackupLearningRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupLearningComparison> => ({
  assignments: await compareBackupRecords(archive, browser, assignments, signal),
  submissions: await compareBackupRecords(archive, browser, submissions, signal),
  attemptComparisonVersion: 1,
  attempts: await compareBackupRecords(archive, browser, attempts, signal),
});
export const assertCompleteLearningComparison = (review: BackupLearningComparison) => {
  assertCompleteBackupRecordComparison(review.assignments, assignments);
  assertCompleteBackupRecordComparison(review.submissions, submissions);
  if (review.attemptComparisonVersion !== undefined || review.attempts !== undefined) {
    if (review.attemptComparisonVersion !== 1 || !review.attempts) throw new Error("Раздел попыток отсутствует или несовместим. Проверьте архив заново; неполный отчёт не скачан.");
    assertCompleteBackupRecordComparison(review.attempts, attempts);
  }
};

export const getUncheckedLearningDocuments = (review: BackupLearningComparison) => new Set([...review.assignments.uncompared, ...review.submissions.uncompared, ...(review.attempts?.uncompared ?? [])].map((item) => item.key)).size;
export const getLearningBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => [assignments, submissions, attempts].find(item => item.collection === collection);
