import { assessmentBackupFixture } from "./assessmentBackup";
import { backupTime } from "./localBackup";
import { applyAssessmentCommand } from "../domain/assessments";
import type { AssessmentCommand, AssessmentCommandContext, AssessmentDocument, AssessmentKind, AssessmentOutcome } from "../domain/assessmentTypes";

type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
export const assessmentCorrectionFixture = (kind: AssessmentKind = "exam", commission = false) => {
  const source = assessmentBackupFixture(kind, commission);
  const context = { accounts: source.accounts.accounts, accountsRevision: 1, groups: source.groups.groups, groupRevision: 1, subjects: source.subjects.subjects, subjectRevision: 1 };
  const initial = source.document; const attempt = initial.assessments[0].attempts.at(-1)!;
  const ids = { assessmentId: initial.assessments[0].id, attemptId: attempt.id };
  const run = (state: AssessmentDocument, operation: Payload, actorId = "configurator-demo", occurredAt = backupTime) => applyAssessmentCommand(state,
    { ...operation, actorId, actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1 }, context,
    { assessmentId: `assessment-${state.revision}`, attemptId: `attempt-${state.revision}`, historyId: `history-${state.revision}`, occurredAt });
  const open = (state = initial) => run(state, { type: "open-correction", ...ids, reason: "PRIVATE CORRECTION REASON" });
  const save = (state: AssessmentDocument, outcome: AssessmentOutcome | null = kind === "pass" ? { status: "failed" } : { status: "graded", grade: 2 }) => run(state, { type: "save-correction", ...ids, correctionId: state.corrections.at(-1)!.id, results: [{ studentId: "student-1", outcome }] }, "teacher-1");
  const publish = (state: AssessmentDocument) => run(state, { type: "publish-correction", ...ids, correctionId: state.corrections.at(-1)!.id }, "teacher-1");
  return { source, context, initial, ids, attempt, run, open, save, publish };
};
