import type { Assignment, Submission, SubmissionAttempt } from "../data/assignmentStore";

export type SavedAssignment = Partial<Assignment> & Pick<Assignment, "id" | "subject" | "group" | "lessonDate" | "lessonType" | "title" | "description" | "deadline">;
export type SavedSubmission = Partial<Submission> & Pick<Submission, "id" | "assignmentId" | "studentId" | "studentName" | "sentAt">;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOptionalAssignmentStrings = (item: Record<string, unknown>, fields: readonly string[]) => fields.every((field) => item[field] === undefined || typeof item[field] === "string");
const isAttempt = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && Boolean(value.id.trim())
    && typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0
    && typeof value.text === "string"
    && typeof value.sentAt === "string" && Number.isFinite(Date.parse(value.sentAt))
    && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt))
    && ["submitted", "revision", "graded"].includes(value.status as string)
    && typeof value.submittedLate === "boolean"
    && hasOptionalAssignmentStrings(value, ["attachmentId", "attachmentName", "teacherComment", "grade", "reviewedAt"])
    && (value.reviewedAt === undefined || Number.isFinite(Date.parse(value.reviewedAt as string)));
};
const hasValidAttempts = (submission: Record<string, unknown>) => {
  if (submission.attempts === undefined) return true;
  if (!Array.isArray(submission.attempts) || !submission.attempts.every(isAttempt)) return false;
  // Empty histories are legacy records; keep their top-level answer for normalization.
  return new Set(submission.attempts.map((attempt) => attempt.id)).size === submission.attempts.length;
};

const decodeList = <T,>(raw: string, fields: readonly string[], submission = false): T[] => {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some((item: unknown) => !isRecord(item) || fields.some((field) => typeof item[field] !== "string")
    || (submission && (!hasOptionalAssignmentStrings(item, ["text", "comment", "teacherComment", "grade", "attachmentId", "attachmentName", "updatedAt"]) || !hasValidAttempts(item))))) throw new Error("Сохранённые задания или ответы повреждены");
  return value as T[];
};

export const decodeSavedAssignments = (raw: string) => decodeList<SavedAssignment>(raw, ["id", "subject", "group", "title", "description", "lessonDate", "deadline"]);
export const decodeSavedSubmissions = (raw: string) => decodeList<SavedSubmission>(raw, ["id", "assignmentId", "studentId", "studentName", "sentAt"], true);

const hasDate = (value: string | undefined) => value !== undefined && Number.isFinite(Date.parse(value));
const optionalDate = (value: string | undefined) => value === undefined || hasDate(value);
const uniqueIds = (items: { id: string }[]) => items.every((item) => item.id.trim()) && new Set(items.map((item) => item.id)).size === items.length;

/** Archive checks are stricter than the legacy screen reader and never normalize saved values. */
export const decodeBackupAssignments = (raw: string) => {
  const items = decodeSavedAssignments(raw);
  if (!uniqueIds(items) || items.some((item) => !hasOptionalAssignmentStrings(item as Record<string, unknown>, ["subjectId", "groupId", "attachmentId", "attachmentName", "createdAt", "updatedAt"])
    || !hasDate(item.lessonDate) || !hasDate(item.deadline) || !optionalDate(item.createdAt) || !optionalDate(item.updatedAt)
    || !["Лекция", "Практика", "Лабораторная"].includes(item.lessonType)
    || (item.status !== undefined && !["draft", "published", "closed", "archived"].includes(item.status))
    || (item.allowLateSubmissions !== undefined && typeof item.allowLateSubmissions !== "boolean")
    || (item.subjectId !== undefined && !item.subjectId.trim()) || (item.groupId !== undefined && !item.groupId.trim()))) {
    throw new Error("Некорректная структура заданий: проверьте ID, даты, типы занятий и состояния. Исходные записи не изменены.");
  }
  return items;
};

const orderedAttempt = (attempt: SubmissionAttempt, index: number, attempts: SubmissionAttempt[]) => attempt.number === index + 1
  && Date.parse(attempt.updatedAt) >= Date.parse(attempt.sentAt)
  && (index === 0 || Date.parse(attempt.sentAt) >= Date.parse(attempts[index - 1].sentAt));

export const decodeBackupSubmissions = (raw: string) => {
  const items = decodeSavedSubmissions(raw);
  if (!uniqueIds(items) || items.some((item) => !item.assignmentId.trim() || !item.studentId.trim()
    || !hasDate(item.sentAt) || !optionalDate(item.updatedAt)
    || (item.status !== undefined && !["submitted", "revision", "graded"].includes(item.status))
    || (item.attemptCount !== undefined && (!Number.isSafeInteger(item.attemptCount) || item.attemptCount < 0))
    || (item.attempts !== undefined && !item.attempts.every(orderedAttempt)))) {
    throw new Error("Некорректная структура ответов: проверьте ID, даты, состояния и порядок попыток. Исходные записи не изменены.");
  }
  return items;
};
