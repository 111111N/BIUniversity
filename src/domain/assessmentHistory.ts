import type { AssessmentAttemptHistoryEntry, AssessmentAttemptHistoryPage, AssessmentAttemptHistoryRequest, AssessmentDocument, AssessmentHistoryEntry } from "./assessmentTypes";
import { requireAssessmentActor, type AssessmentDomainContext } from "./assessments";

export const ASSESSMENT_HISTORY_PAGE_SIZE = 20;
const isAssignmentEntry = (entry: AssessmentHistoryEntry): entry is AssessmentHistoryEntry & { action: AssessmentAttemptHistoryEntry["action"] } =>
  entry.action === "created" || entry.action === "attempt-created" || entry.action === "attempt-updated" || entry.action === "attempt-cancelled" || entry.action === "supervisor-changed";

/** Receives a decoded document; pages are newest first, including a stable order for equal timestamps. */
export const readAssessmentAttemptHistory = (state: AssessmentDocument, request: AssessmentAttemptHistoryRequest, context: AssessmentDomainContext): AssessmentAttemptHistoryPage => {
  const actor = requireAssessmentActor(state, request, context);
  if (actor.role !== "configurator") throw new Error("История назначения доступна только настройщику.");
  if (!Number.isSafeInteger(request.page) || request.page < 1) throw new Error("Укажите корректную страницу истории назначения.");
  const assessment = state.assessments.find((entry) => entry.id === request.assessmentId);
  if (!assessment?.attempts.some((entry) => entry.id === request.attemptId)) throw new Error("Попытка аттестации недоступна. Обновите данные.");
  const matches = (entry: AssessmentHistoryEntry) => entry.assessmentId === request.assessmentId && entry.attemptId === request.attemptId && isAssignmentEntry(entry);
  let total = 0;
  for (const entry of state.history) if (matches(entry)) total += 1;
  const pages = Math.max(1, Math.ceil(total / ASSESSMENT_HISTORY_PAGE_SIZE));
  const page = Math.min(request.page, pages);
  const offset = (page - 1) * ASSESSMENT_HISTORY_PAGE_SIZE;
  const items: AssessmentAttemptHistoryEntry[] = [];
  let seen = 0;
  // Copy only this page and only audit fields: large cohorts and results stay inside the source document.
  for (let index = state.history.length - 1; index >= 0 && items.length < ASSESSMENT_HISTORY_PAGE_SIZE; index -= 1) {
    const entry = state.history[index];
    if (!matches(entry) || !isAssignmentEntry(entry)) continue;
    if (seen++ < offset) continue;
    const assignment = entry.assignment;
    items.push({
      id: entry.id, actorId: entry.actorId, occurredAt: entry.occurredAt, action: entry.action,
      ...(assignment ? { assignment: { date: assignment.date, startsAt: assignment.startsAt, ...(assignment.room === undefined ? {} : { room: assignment.room }), teacherId: assignment.teacherId, chairId: assignment.chairId, memberIds: [...assignment.memberIds] } } : {}),
      ...(entry.assignmentOrigin ? { assignmentOrigin: entry.assignmentOrigin } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.previousSupervisorId ? { previousSupervisorId: entry.previousSupervisorId } : {}),
    });
  }
  return { revision: state.revision, items, total, page, pages };
};
