import type { SavedSubmission } from "./assignmentStorage";

interface SubmissionConsistencyIssue {
  level: "error" | "review";
  code: string;
  message: string;
}

const mirroredFields = {
  text: "текст ответа", status: "состояние", attachmentId: "ID вложения",
  attachmentName: "имя вложения", teacherComment: "комментарий преподавателя", grade: "оценка",
} as const;
const sameTime = (first: string, second: string) => Date.parse(first) === Date.parse(second);

/** Inspect already decoded archive records without normalizing away conflicting values. */
export const getSubmissionConsistencyIssues = (submission: SavedSubmission): SubmissionConsistencyIssue[] => {
  const attempts = submission.attempts;
  if (!attempts?.length) {
    return submission.attemptCount !== undefined && submission.attemptCount !== 1 ? [{
      level: "review", code: "unverified-attempt-count",
      message: "Счётчик ответа не подтверждается сохранённой историей: массив попыток отсутствует или пуст. Нужно проверить полноту истории; попытки не создавались.",
    }] : [];
  }

  const issues: SubmissionConsistencyIssue[] = [];
  if (submission.attemptCount !== undefined && submission.attemptCount !== attempts.length) issues.push({
    level: "error", code: "attempt-count-mismatch", message: "Счётчик ответа не совпадает с числом сохранённых попыток. История не изменена.",
  });
  const latest = attempts[attempts.length - 1];
  const differentFields: string[] = (Object.keys(mirroredFields) as (keyof typeof mirroredFields)[])
    .filter((field) => submission[field] !== undefined && submission[field] !== latest[field])
    .map((field) => mirroredFields[field]);
  if (submission.updatedAt !== undefined && !sameTime(submission.updatedAt, latest.updatedAt)) differentFields.push("дата обновления");
  if (differentFields.length) issues.push({
    level: "error", code: "latest-attempt-mismatch",
    message: `Поля карточки ответа расходятся с последней попыткой: ${differentFields.join(", ")}. Нужно проверить источник верных значений; данные не исправлялись.`,
  });
  // The workflow keeps its first send date; resubmission has its own date inside the latest attempt.
  if (!sameTime(submission.sentAt, attempts[0].sentAt)) issues.push({
    level: "error", code: "first-attempt-date-mismatch", message: "Дата первой отправки карточки ответа не совпадает с первой сохранённой попыткой. Даты не изменены.",
  });
  for (const attempt of attempts) {
    if (attempt.reviewedAt !== undefined && (Date.parse(attempt.reviewedAt) < Date.parse(attempt.sentAt) || Date.parse(attempt.reviewedAt) > Date.parse(attempt.updatedAt))) issues.push({
      level: "error", code: `attempt-review-time-${attempt.number}`,
      message: `Попытка №${attempt.number}: дата проверки находится вне интервала от отправки до последнего обновления попытки. Даты не изменены.`,
    });
  }
  return issues;
};
