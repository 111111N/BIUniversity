import { describe, expect, it } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { backupTime } from "../testSupport/localBackup";
import { applyAssessmentCommand, assessmentAttemptAssignment, decodeAssessmentDocument, emptyAssessmentDocument, manageableAssessmentAttemptIds, projectAssessments } from "./assessments";
import type { AssessmentCommand, AssessmentCommandContext, AssessmentDocument, AssessmentKind, AssessmentOutcome } from "./assessmentTypes";
import { buildStudentRecordBook } from "./studentRecordBook";

type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
const setup = (kind: AssessmentKind = "exam") => {
  const source = assessmentBackupFixture(kind);
  const context = { accounts: source.accounts.accounts, accountsRevision: 1, groups: source.groups.groups, groupRevision: 1, subjects: source.subjects.subjects, subjectRevision: 1 };
  const run = (state: AssessmentDocument, operation: Payload, actorId = "configurator-demo", occurredAt = backupTime) => applyAssessmentCommand(state,
    { ...operation, actorId, actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1 }, context,
    { assessmentId: `assessment-${state.revision}`, attemptId: `attempt-${state.revision}`, historyId: `history-${state.revision}`, occurredAt });
  const attempt = assessmentAttemptAssignment(source.document.assessments[0].attempts[0]);
  const initial = run(emptyAssessmentDocument(), { type: "create", draft: { kind, title: "Контроль знаний", groupId: "group-1", subjectId: "subject-1", period: "2026/2027", recordBook: { semester: 1, hours: 72, category: "required" }, attempt } });
  const ids = { assessmentId: initial.assessments[0].id, attemptId: initial.assessments[0].attempts[0].id };
  const save = (state: AssessmentDocument, outcome: AssessmentOutcome | null) => run(state, { type: "save-results", ...ids, results: [{ studentId: "student-1", outcome }] }, "teacher-1");
  return { source, context, initial, ids, attempt, run, save };
};

describe("assessment assignment editing and cancellation", () => {
  it.each<AssessmentKind>(["exam", "pass", "gradedPass", "internship", "thesis", "coursework"])("edits %s after the scheduled instant while no result has ever been saved", (kind) => {
    const { initial, ids, attempt, run } = setup(kind);
    const before = JSON.stringify(initial);
    const next = run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, date: "2026-11-01", startsAt: "14:00", room: "202" } });
    expect(next.assessments[0].attempts[0]).toMatchObject({ id: ids.attemptId, date: "2026-11-01", startsAt: "14:00", room: "202" });
    expect(next.history[0].assignment).toMatchObject(attempt);
    expect(next.history.at(-1)).toMatchObject({ action: "attempt-updated", actorId: "configurator-demo", assignment: { room: "202", startsAt: "14:00" } });
    expect(JSON.stringify(initial)).toBe(before); expect(decodeAssessmentDocument(JSON.stringify(next))).toEqual(next);
  });
  it.each<AssessmentOutcome>([{ status: "graded", grade: 2 }, { status: "absent" }, { status: "passed" }, { status: "failed" }])("never unlocks after the first saved $status result is cleared", (outcome) => {
    const { initial, ids, attempt, run, save } = setup(outcome.status === "passed" || outcome.status === "failed" ? "pass" : "exam");
    const cleared = save(save(initial, outcome), null);
    expect(cleared.assessments[0].attempts[0].results[0].outcome).toBeNull();
    expect(manageableAssessmentAttemptIds(cleared)).toEqual([]);
    expect(() => run(cleared, { type: "update-attempt", ...ids, draft: { ...attempt, room: "202" } })).toThrow("первого сохранённого результата");
    expect(() => run(cleared, { type: "cancel-attempt", ...ids, reason: "Перенос" })).toThrow("первого сохранённого результата");
    const forged = structuredClone(cleared); const time = backupTime;
    forged.assessments[0].attempts[0].state = "cancelled";
    forged.assessments[0].attempts[0].cancellation = { actorId: "configurator-demo", occurredAt: time, reason: "Перенос" };
    forged.history.push({ id: "forged", ...ids, actorId: "configurator-demo", occurredAt: time, action: "attempt-cancelled", results: null, recordBook: forged.assessments[0].recordBook, reason: "Перенос" }); forged.revision++;
    expect(() => decodeAssessmentDocument(JSON.stringify(forged))).toThrow();
  });
  it("does not treat saving an entirely blank statement as a recorded result", () => {
    const { initial, ids, attempt, run, save } = setup();
    const blank = save(initial, null);
    expect(manageableAssessmentAttemptIds(blank)).toEqual([ids.attemptId]);
    expect(run(blank, { type: "update-attempt", ...ids, draft: { ...attempt, room: "202" } }).history.at(-1)?.action).toBe("attempt-updated");
  });
  it("uses the audited assignment's teacher and Moscow time after editing", () => {
    const { initial, ids, attempt, run } = setup();
    const changed = run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, teacherId: "member", startsAt: "15:00" } });
    const operation: Payload = { type: "save-results", ...ids, results: [{ studentId: "student-1", outcome: { status: "graded", grade: 5 } }] };
    expect(() => run(changed, operation, "teacher-1", "2026-10-28T12:00:00Z")).toThrow("назначенный преподаватель");
    expect(() => run(changed, operation, "member", "2026-10-28T11:59:59Z")).toThrow("назначенных даты и времени");
    const saved = run(changed, operation, "member", "2026-10-28T12:00:00Z");
    expect(decodeAssessmentDocument(JSON.stringify(saved))).toEqual(saved);
    const tampered = structuredClone(saved); tampered.assessments[0].attempts[0].room = "Без аудита";
    expect(() => decodeAssessmentDocument(JSON.stringify(tampered))).toThrow();
  });
  it("keeps the supervisor, cohort and attempt kind fixed and requires valid commission assignments", () => {
    const { initial, ids, attempt, run } = setup("thesis");
    expect(() => run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, teacherId: "member" } })).toThrow();
    expect(() => run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, studentIds: [] } })).toThrow();
    expect(() => run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, chairId: "chair", memberIds: ["member"] } })).toThrow();
    expect(() => run(initial, { type: "update-attempt", ...ids, draft: attempt })).toThrow("не изменилось");
  });
  it.each(["teacher-1", "student-1"])("denies management to %s and preserves the original", (actorId) => {
    const { initial, ids, attempt, run } = setup(); const before = JSON.stringify(initial);
    expect(() => run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, room: "202" } }, actorId)).toThrow("настройщик");
    expect(() => run(initial, { type: "cancel-attempt", ...ids, reason: "Перенос" }, actorId)).toThrow("настройщик");
    expect(JSON.stringify(initial)).toBe(before);
  });
  it("preserves cancelled attempts and schedules a replacement primary with a new monotonic ID and number", () => {
    const { initial, ids, attempt, run, context } = setup();
    const planned = run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, date: "2026-12-01" } });
    const cancelled = run(planned, { type: "cancel-attempt", ...ids, reason: "Изменение расписания" });
    expect(cancelled.assessments[0].attempts[0]).toMatchObject({ state: "cancelled", cancellation: { reason: "Изменение расписания" } });
    const next = run(cancelled, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "primary", draft: attempt });
    expect(next.assessments[0].attempts.map((entry) => [entry.number, entry.kind, entry.state])).toEqual([[1, "primary", "cancelled"], [2, "primary", "draft"]]);
    expect(next.assessments[0].attempts[1].id).not.toBe(ids.attemptId);
    expect(next.history.slice(0, cancelled.history.length)).toEqual(cancelled.history);
    const student = projectAssessments(next, context.accounts.find((account) => account.id === "student-1")!)[0];
    expect(student.attempts[0]).toMatchObject({ state: "cancelled", results: [] }); expect(student.attempts[0]).not.toHaveProperty("cancellation");
    expect(() => run(cancelled, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "retake", draft: attempt })).toThrow("основную сдачу заново");
    expect(decodeAssessmentDocument(JSON.stringify(next))).toEqual(next);
  });
  it("preserves published results when a commission is cancelled and validates replacement chronology", () => {
    const { initial, ids, attempt, run, save } = setup();
    const published = run(save(initial, { status: "graded", grade: 2 }), { type: "publish", ...ids }, "teacher-1");
    const commission = run(published, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "commission", draft: { ...attempt, chairId: "chair", memberIds: ["member"], date: "2026-11-01" } });
    expect(() => run(commission, { type: "cancel-attempt", ...ids, reason: "Попытка закрыта" })).toThrow("первого сохранённого результата");
    const target = { assessmentId: ids.assessmentId, attemptId: commission.assessments[0].attempts[1].id };
    const edited = run(commission, { type: "update-attempt", ...target, draft: { ...attempt, chairId: "member", memberIds: ["chair"], date: "2026-11-02" } });
    const cancelled = run(edited, { type: "cancel-attempt", ...target, reason: "Перенос комиссии" });
    expect(buildStudentRecordBook(cancelled.assessments, [], "student-1")[0].rows[0].outcome).toEqual({ status: "graded", grade: 2 });
    expect(() => run(cancelled, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "commission", draft: { ...attempt, chairId: "chair", memberIds: ["member"], date: "2026-10-27" } })).toThrow("предыдущей опубликованной");
    const replaced = run(cancelled, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "commission", draft: { ...attempt, chairId: "chair", memberIds: ["member"] } });
    expect(replaced.assessments[0].attempts[2].number).toBe(3);
    expect(replaced.assessments[0].attempts[0]).toEqual(published.assessments[0].attempts[0]);
    const ordinary = run(cancelled, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "retake", draft: attempt });
    expect(ordinary.assessments[0].attempts[2].kind).toBe("retake");
  });
  it.each(["", " ", "A", "A\nB", "A".repeat(501)])("rejects cancellation reason %j", (reason) => {
    const { initial, ids, run } = setup();
    expect(() => run(initial, { type: "cancel-attempt", ...ids, reason })).toThrow("причину отмены");
  });
  it("rejects saving, publishing or changing an already cancelled attempt", () => {
    const { initial, ids, attempt, run, save } = setup();
    const cancelled = run(initial, { type: "cancel-attempt", ...ids, reason: "Перенос" });
    expect(() => save(cancelled, { status: "absent" })).toThrow("отменённая");
    expect(() => run(cancelled, { type: "publish", ...ids }, "teacher-1")).toThrow("отменённая");
    expect(() => run(cancelled, { type: "update-attempt", ...ids, draft: attempt })).toThrow();
  });
  it("migrates strict v2 history in memory and rejects missing creation snapshots in v3", () => {
    const { initial } = setup();
    const legacy = { version: 2, revision: initial.revision, assessments: initial.assessments, history: initial.history.map(({ assignment: _assignment, ...entry }) => entry) }; const raw = JSON.stringify(legacy);
    const migrated = decodeAssessmentDocument(raw);
    expect(migrated.assessments).toEqual(initial.assessments); expect(migrated.history[0]).toEqual({ ...initial.history[0], assignmentOrigin: "legacy-snapshot" });
    expect(JSON.stringify(legacy)).toBe(raw);
    expect(() => decodeAssessmentDocument(JSON.stringify({ ...legacy, version: 3 }))).toThrow();
  });
  it("does not require inventing the unknown room of a legacy commission when editing its date", () => {
    const { initial, ids, attempt, run, save } = setup();
    const published = run(save(initial, { status: "graded", grade: 2 }), { type: "publish", ...ids }, "teacher-1");
    const commission = run(published, { type: "add-attempt", assessmentId: ids.assessmentId, kind: "commission", draft: { ...attempt, chairId: "chair", memberIds: ["member"] } });
    const target = commission.assessments[0].attempts[1]; delete target.room;
    for (const entry of commission.history) if (entry.attemptId === target.id && entry.assignment) delete entry.assignment.room;
    const legacy = { version: 2, revision: commission.revision, assessments: commission.assessments, history: commission.history.map(({ assignment: _assignment, ...entry }) => entry) };
    const migrated = decodeAssessmentDocument(JSON.stringify(legacy));
    const changed = run(migrated, { type: "update-attempt", assessmentId: ids.assessmentId, attemptId: target.id, draft: { ...assessmentAttemptAssignment(target), date: "2026-11-01" } });
    expect(changed.assessments[0].attempts[1]).not.toHaveProperty("room");
    expect(changed.history.at(-1)?.assignment).not.toHaveProperty("room");
  });
  it("does not accept legacy provenance on a newly edited assignment", () => {
    const { initial, ids, attempt, run } = setup();
    const changed = run(initial, { type: "update-attempt", ...ids, draft: { ...attempt, room: "202" } });
    changed.history.at(-1)!.assignmentOrigin = "legacy-snapshot";
    expect(() => decodeAssessmentDocument(JSON.stringify(changed))).toThrow();
  });
});
