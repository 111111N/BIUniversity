import { ASSESSMENTS_STORAGE_KEY, type AssessmentCommand, type AssessmentCommandContext, type AssessmentDocument, type AssessmentKind } from "../domain/assessmentTypes";
import { applyAssessmentCommand, emptyAssessmentDocument } from "../domain/assessments";
import { coreBackupFixture } from "./localBackupDocuments";
import { backupTime } from "./localBackup";

type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
export const assessmentBackupFixture = (kind: AssessmentKind = "exam", commission = false) => {
  const core = coreBackupFixture();
  core.accounts.accounts.push(...["chair", "member"].map((id) => ({ ...core.accounts.accounts[1], id, login: id })));
  const context = { accounts: core.accounts.accounts, accountsRevision: 1, groups: core.groups.groups, groupRevision: 1, subjects: core.subjects.subjects, subjectRevision: 1 };
  let document = emptyAssessmentDocument();
  const execute = (operation: Payload, actorId = "configurator-demo") => {
    document = applyAssessmentCommand(document, { actorId, actorRevision: 1, expectedRevision: document.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1, ...operation }, context, {
      assessmentId: `assessment-${document.revision}`, attemptId: `attempt-${document.revision}`, historyId: `history-${document.revision}`, occurredAt: backupTime,
    });
  };
  const attempt = { date: "2026-10-28", startsAt: "12:00", room: "101", teacherId: "teacher-1", chairId: null, memberIds: [], studentIds: ["student-1"] };
  execute({ type: "create", draft: { kind, title: "PRIVATE ASSESSMENT TITLE", subjectId: "subject-1", groupId: "group-1", period: "PRIVATE PERIOD", attempt, recordBook: { semester: 1, hours: 72, category: "required" } } });
  const publish = () => {
    const ids = { assessmentId: document.assessments[0].id, attemptId: document.assessments[0].attempts.at(-1)!.id };
    execute({ type: "save-results", ...ids, results: [{ studentId: "student-1", outcome: kind === "pass" ? { status: "passed" } : { status: "graded", grade: 5 } }] }, "teacher-1");
    execute({ type: "publish", ...ids }, "teacher-1");
  };
  publish();
  if (commission) {
    execute({ type: "add-attempt", assessmentId: document.assessments[0].id, kind: "commission", draft: { ...attempt, chairId: "chair", memberIds: ["member"] } });
    publish();
  }
  const save = (value: AssessmentDocument = document) => {
    core.save(); core.archive.localStorage.push({ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(value) });
    core.archive.totals.storageEntries = core.archive.localStorage.length;
    return core.archive;
  };
  save();
  return { ...core, document, save, sources: { accountIds: new Set(core.accounts.accounts.map((entry) => entry.id)), groupIds: new Set(["group-1"]), subjectIds: new Set(["subject-1"]) } };
};
