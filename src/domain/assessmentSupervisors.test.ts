import { describe, expect, it } from "vitest";
import { assessmentSupervisorFixture } from "../testSupport/assessmentSupervisors";
import { assessmentCorrectionFixture } from "../testSupport/assessmentCorrections";
import { assessmentAttemptAssignment, decodeAssessmentDocument, manageableSupervisorAssessmentIds, projectAssessments } from "./assessments";
import { readAssessmentAttemptHistory } from "./assessmentHistory";
import { inspectAssessmentDependencies } from "./assessmentDependencies";
import { inspectBackupAssessments } from "./backupAssessmentDocuments";
import { compareBackupAssessmentRecords } from "./backupAssessmentComparison";
import { ASSESSMENTS_STORAGE_KEY, type AssessmentKind, type AssessmentOutcome } from "./assessmentTypes";
import { backupTime } from "../testSupport/localBackup";

describe("audited supervisor replacement before the first assessment result", () => {
  it.each<AssessmentKind>(["thesis", "coursework"])("changes %s supervisor without changing the attempt, roster, date or previous audit", (kind) => {
    const { initial, assessmentId, change } = assessmentSupervisorFixture(kind); const before = JSON.stringify(initial);
    expect(manageableSupervisorAssessmentIds(initial)).toEqual([assessmentId]);
    const next = change(); const old = initial.assessments[0].attempts[0];
    expect(next.assessments[0].supervisorId).toBe("chair");
    expect(next.assessments[0].attempts).toEqual([{ ...old, teacherId: "chair" }]);
    expect(next.assessments[0].roster).toEqual(initial.assessments[0].roster); expect(next.history.slice(0, -1)).toEqual(initial.history);
    expect(next.history.at(-1)).toMatchObject({ action: "supervisor-changed", previousSupervisorId: "teacher-1", reason: "PRIVATE REPLACEMENT REASON", actorId: "configurator-demo", assignment: { teacherId: "chair" } });
    expect(next.history[0].assignment?.teacherId).toBe("teacher-1");
    expect(decodeAssessmentDocument(JSON.stringify(next))).toEqual(next); expect(JSON.stringify(initial)).toBe(before);
  });
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship"])("does not treat %s as supervised work", (kind) => {
    const { change, initial } = assessmentSupervisorFixture(kind);
    expect(manageableSupervisorAssessmentIds(initial)).toEqual([]); expect(() => change()).toThrow("ВКР и курсовой");
  });
  it.each(["teacher-1", "student-1", "chair"])("does not let %s replace a supervisor", (actorId) => {
    const { initial, assessmentId, run } = assessmentSupervisorFixture();
    expect(() => run(initial, { type: "change-supervisor", assessmentId, teacherId: "chair", reason: "Замена" }, actorId)).toThrow("только настройщик");
  });
  it.each(["", "x", "x".repeat(501), "Причина\nдругая", " причина "])("requires a valid reason %j", (reason) => {
    const { initial, assessmentId, run } = assessmentSupervisorFixture();
    expect(() => run(initial, { type: "change-supervisor", assessmentId, teacherId: "chair", reason })).toThrow("причину");
  });
  it("rejects the current, missing, blocked or non-teacher account", () => {
    const { change, initial, context } = assessmentSupervisorFixture();
    expect(() => change(initial, "teacher-1")).toThrow("уже является");
    for (const id of ["missing", "student-1", "configurator-demo"]) expect(() => change(initial, id)).toThrow("действующего преподавателя");
    context.accounts.find((row) => row.id === "chair")!.status = "blocked";
    expect(() => change()).toThrow("действующего преподавателя");
  });
  it.each<AssessmentOutcome>([{ status: "graded", grade: 2 }, { status: "absent" }])("permanently closes replacement after a saved $status, including later clearing", (outcome) => {
    const { initial, save, change } = assessmentSupervisorFixture();
    for (const state of [save(initial, outcome), save(save(initial, outcome), null)]) {
      expect(manageableSupervisorAssessmentIds(state)).toEqual([]);
      expect(() => change(state)).toThrow("первого сохранённого результата");
    }
    expect(() => change(save(initial, null))).not.toThrow();
  });
  it("closes replacement for the whole assessment if just another student has a result", () => {
    const { initial, assessmentId, run, change } = assessmentSupervisorFixture("thesis", true);
    const attempt = initial.assessments[0].attempts[0];
    const saved = run(initial, { type: "save-results", assessmentId, attemptId: attempt.id, results: [{ studentId: "student-1", outcome: null }, { studentId: "student-2", outcome: { status: "graded", grade: 4 } }] }, "teacher-1");
    expect(manageableSupervisorAssessmentIds(saved)).toEqual([]); expect(() => change(saved)).toThrow();
  });
  it("moves current access to the new supervisor and keeps each replacement in order", () => {
    const { initial, source, assessmentId, run, change, save } = assessmentSupervisorFixture();
    const next = change();
    expect(projectAssessments(next, source.accounts.accounts.find((account) => account.id === "teacher-1")!)).toEqual([]);
    expect(projectAssessments(next, source.accounts.accounts.find((account) => account.id === "chair")!)[0].attempts[0].teacherId).toBe("chair");
    expect(() => run(next, { type: "save-results", assessmentId, attemptId: initial.assessments[0].attempts[0].id, results: initial.assessments[0].attempts[0].results }, "teacher-1")).toThrow("назначенный преподаватель");
    const again = change(next, "member");
    expect(again.history.slice(1).map((entry) => [entry.previousSupervisorId, entry.assignment?.teacherId])).toEqual([["teacher-1", "chair"], ["chair", "member"]]);
    expect(() => decodeAssessmentDocument(JSON.stringify(save(again)))).not.toThrow();
  });
  it("preserves cancelled attempts and applies the new supervisor to subsequent appointments and retakes", () => {
    const { initial, assessmentId, assignment, run, change, save } = assessmentSupervisorFixture();
    const attempt = initial.assessments[0].attempts[0];
    const cancelled = run(initial, { type: "cancel-attempt", assessmentId, attemptId: attempt.id, reason: "Перенос" });
    expect(manageableSupervisorAssessmentIds(cancelled)).toEqual([]);
    const renewed = run(cancelled, { type: "add-attempt", assessmentId, kind: "primary", draft: assignment });
    const changed = change(renewed);
    expect(changed.assessments[0].attempts[0]).toEqual(cancelled.assessments[0].attempts[0]);
    expect(changed.assessments[0].attempts[1].teacherId).toBe("chair");
    const saved = save(changed); const latest = saved.assessments[0].attempts[1];
    const published = run(saved, { type: "publish", assessmentId, attemptId: latest.id }, "chair");
    expect(() => change(published, "member")).toThrow("первого сохранённого результата");
    expect(() => run(published, { type: "add-attempt", assessmentId, kind: "retake", draft: assignment })).toThrow("назначенный научный руководитель");
    const retake = run(published, { type: "add-attempt", assessmentId, kind: "retake", draft: { ...assessmentAttemptAssignment(latest), room: "202" } });
    expect(retake.assessments[0].attempts[2].teacherId).toBe("chair");
    expect(() => decodeAssessmentDocument(JSON.stringify(retake))).not.toThrow();
  });
  it.each(["missing-event", "old-id", "reason", "date", "teacher", "ordinary-edit", "root"])("rejects altered replacement evidence: %s", (mode) => {
    const { change } = assessmentSupervisorFixture(); const state = change(); const event = state.history.at(-1)!;
    if (mode === "missing-event") { state.history.pop(); state.revision -= 1; }
    if (mode === "old-id") event.previousSupervisorId = "member";
    if (mode === "reason") event.reason = "";
    if (mode === "date") event.assignment!.startsAt = "15:00";
    if (mode === "teacher") event.assignment!.teacherId = "member";
    if (mode === "ordinary-edit") { event.action = "attempt-updated"; delete event.previousSupervisorId; delete event.reason; }
    if (mode === "root") state.assessments[0].supervisorId = "member";
    expect(() => decodeAssessmentDocument(JSON.stringify(state))).toThrow();
  });
  it("migrates v4 including published corrections without adding or changing audit events", () => {
    const { open, save, publish } = assessmentCorrectionFixture("thesis"); const current = publish(save(open()));
    const legacy = { ...current, version: 4 }; const raw = JSON.stringify(legacy);
    expect(decodeAssessmentDocument(raw)).toEqual(current); expect(JSON.stringify(legacy)).toBe(raw);
    const { change } = assessmentSupervisorFixture();
    expect(() => decodeAssessmentDocument(JSON.stringify({ ...change(), version: 4 }))).toThrow();
  });
  it("returns a bounded audit projection and checks references to the previous supervisor", async () => {
    const { source, context, assessmentId, change } = assessmentSupervisorFixture(); const state = change();
    const request = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1, assessmentId, attemptId: state.assessments[0].attempts[0].id, page: 1 };
    const page = readAssessmentAttemptHistory(state, request, context);
    expect(page.items[0]).toMatchObject({ action: "supervisor-changed", previousSupervisorId: "teacher-1", assignment: { teacherId: "chair" } });
    expect(page.items[0].assignment).not.toHaveProperty("studentIds");
    const accounts = source.accounts.accounts.filter((account) => account.id !== "teacher-1");
    const issues = inspectAssessmentDependencies(state, { accounts, groups: source.groups.groups, subjects: source.subjects.subjects });
    expect(issues.some((entry) => entry.detail.includes("teacher-1"))).toBe(true);
    const entry = { key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(state) };
    const review = await inspectBackupAssessments([entry], { ...source.sources, accountIds: new Set(accounts.map((account) => account.id)) }, backupTime);
    expect(review.issues.some((issue) => issue.referenceId === "teacher-1")).toBe(true);
    const other = structuredClone(state); other.history.at(-1)!.reason = "PRIVATE DIFFERENT REASON";
    const comparison = await compareBackupAssessmentRecords([entry], [{ ...entry, raw: JSON.stringify(other) }]);
    expect(comparison.history.differences[0].fields).toContain("reason"); expect(JSON.stringify(comparison)).not.toContain("PRIVATE");
  });
});
