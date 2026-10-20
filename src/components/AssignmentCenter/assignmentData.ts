import { getAssignments, getSubmissions } from "../../data/assignmentStore";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const optionalStrings = (item: Record<string, unknown>, fields: string[]) => fields.every((field) => item[field] === undefined || typeof item[field] === "string");
const isAttempt = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && Boolean(value.id.trim())
    && typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0
    && typeof value.text === "string"
    && typeof value.sentAt === "string" && Number.isFinite(Date.parse(value.sentAt))
    && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt))
    && ["submitted", "revision", "graded"].includes(value.status as string)
    && typeof value.submittedLate === "boolean"
    && optionalStrings(value, ["attachmentId", "attachmentName", "teacherComment", "grade", "reviewedAt"])
    && (value.reviewedAt === undefined || Number.isFinite(Date.parse(value.reviewedAt as string)));
};
const hasValidAttempts = (submission: Record<string, unknown>) => {
  if (submission.attempts === undefined) return true;
  if (!Array.isArray(submission.attempts) || !submission.attempts.every(isAttempt)) return false;
  // Empty histories are legacy records; keep their top-level answer for normalization.
  return new Set(submission.attempts.map((attempt) => attempt.id)).size === submission.attempts.length;
};

export const readAssignmentData = () => {
  for (const [key, fields] of [
    ["bi-university-demo-assignments", ["id", "subject", "group", "title", "description", "lessonDate", "deadline"]],
    ["bi-university-demo-submissions", ["id", "assignmentId", "studentId", "studentName", "sentAt"]],
  ] as const) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((item: unknown) => !isRecord(item) || fields.some((field) => typeof item[field] !== "string")
      || (key === "bi-university-demo-submissions" && (!optionalStrings(item, ["text", "comment", "teacherComment", "grade", "attachmentId", "attachmentName", "updatedAt"]) || !hasValidAttempts(item))))) throw new Error("Сохранённые задания или ответы повреждены");
  }
  return { assignments: getAssignments(), submissions: getSubmissions() };
};

export const readAssignmentState = () => {
  try { return { ...readAssignmentData(), error: "" }; }
  catch (error) {
    console.error("Не удалось прочитать задания и ответы журнала:", error);
    return { assignments: [], submissions: [], error: "Не удалось прочитать задания и ответы. Сохранение приостановлено, исходные данные не изменены. Повторите загрузку." };
  }
};
