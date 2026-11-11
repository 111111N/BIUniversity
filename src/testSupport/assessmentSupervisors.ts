import { assessmentBackupFixture } from "./assessmentBackup";
import { backupTime } from "./localBackup";
import { applyAssessmentCommand, assessmentAttemptAssignment, emptyAssessmentDocument } from "../domain/assessments";
import type { AssessmentCommand, AssessmentCommandContext, AssessmentDocument, AssessmentKind, AssessmentOutcome } from "../domain/assessmentTypes";

type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
export const assessmentSupervisorFixture = (kind: AssessmentKind = "thesis", peer = false) => {
  const source = assessmentBackupFixture(kind);
  if (peer) {
    const { studentRecord: _record, ...student } = source.accounts.accounts.find((account) => account.id === "student-1")!;
    source.accounts.accounts.push({ ...student, id: "student-2", login: "student.peer", name: "PRIVATE PEER" });
  }
  const context = { accounts: source.accounts.accounts, accountsRevision: 1, groups: source.groups.groups, groupRevision: 1, subjects: source.subjects.subjects, subjectRevision: 1 };
  const run = (state: AssessmentDocument, operation: Payload, actorId = "configurator-demo", occurredAt = backupTime) => applyAssessmentCommand(state,
    { ...operation, actorId, actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1 }, context,
    { assessmentId: `assessment-${state.revision}`, attemptId: `attempt-${state.revision}`, historyId: `history-${state.revision}`, occurredAt });
  const assignment = assessmentAttemptAssignment(source.document.assessments[0].attempts[0]);
  if (peer) assignment.studentIds.push("student-2");
  const initial = run(emptyAssessmentDocument(), { type: "create", draft: { kind, title: "PRIVATE SUPERVISED WORK", subjectId: "subject-1", groupId: "group-1", period: "2026/2027", attempt: assignment, recordBook: { semester: 1, hours: 72, category: "required" } } });
  const assessmentId = initial.assessments[0].id;
  const change = (state = initial, teacherId = "chair") => run(state, { type: "change-supervisor", assessmentId, teacherId, reason: "PRIVATE REPLACEMENT REASON" });
  const save = (state: AssessmentDocument, outcome: AssessmentOutcome | null = { status: "graded", grade: 5 }) => {
    const attempt = state.assessments[0].attempts.at(-1)!;
    return run(state, { type: "save-results", assessmentId, attemptId: attempt.id, results: attempt.studentIds.map((studentId) => ({ studentId, outcome })) }, attempt.teacherId);
  };
  return { source, context, initial, assignment, assessmentId, run, change, save };
};
