import type { Assessment } from "../../domain/assessmentTypes";

// Record-book metadata is independent of a new attempt; its source is checked by the service revision.
const attemptSource = (assessment: Assessment): string => JSON.stringify([
  assessment.id, assessment.title, assessment.kind, assessment.subjectId, assessment.subjectName,
  assessment.groupId, assessment.groupName, assessment.period, assessment.supervisorId,
  assessment.roster.map((student) => [student.studentId, student.name, student.studentNumber]),
  assessment.attempts.map((attempt) => [
    attempt.id, attempt.number, attempt.kind, attempt.date, attempt.startsAt, attempt.room ?? null,
    attempt.teacherId, attempt.chairId, attempt.memberIds, attempt.studentIds, attempt.state,
    attempt.createdAt, attempt.createdBy, attempt.publishedAt, attempt.publishedBy,
    attempt.cancellation ? [attempt.cancellation.actorId, attempt.cancellation.occurredAt, attempt.cancellation.reason] : null,
    attempt.results.map((result) => [result.studentId, result.outcome?.status ?? null, result.outcome?.status === "graded" ? result.outcome.grade : null]),
  ]),
]);

export function requireUnchangedAttemptSource(original: Assessment | undefined, latest: Assessment | undefined): void {
  if (!original || !latest) throw new Error("Аттестация недоступна. Ввод сохранён; вернитесь к списку и проверьте исходную запись.");
  if (attemptSource(original) !== attemptSource(latest)) throw new Error("Назначение, состав или история попыток этой аттестации изменились. Ввод сохранён. Вернитесь к аттестации и откройте создание попытки заново после проверки изменений.");
}
