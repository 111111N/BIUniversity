import { describe, expect, it } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { backupTime } from "../testSupport/localBackup";
import { readAssessmentAttemptHistory } from "./assessmentHistory";
import { applyAssessmentCommand, assessmentAttemptAssignment, emptyAssessmentDocument } from "./assessments";
import type { AssessmentCommand, AssessmentCommandContext, AssessmentDocument } from "./assessmentTypes";

type Payload = { [K in AssessmentCommand["type"]]: Omit<Extract<AssessmentCommand, { type: K }>, keyof AssessmentCommandContext> }[AssessmentCommand["type"]];
const setup = () => {
  const fixture = assessmentBackupFixture();
  const context = { accounts: fixture.accounts.accounts, accountsRevision: 1, groups: fixture.groups.groups, groupRevision: 1, subjects: fixture.subjects.subjects, subjectRevision: 1 };
  const request = (state: AssessmentDocument) => ({ actorId: "configurator-demo", actorRevision: 1, expectedRevision: state.revision, accountsRevision: 1, groupRevision: 1, subjectRevision: 1, assessmentId: "assessment-0", attemptId: "attempt-0", page: 1 });
  // Command contexts do not include query-only identifiers or pagination.
  const execute = (state: AssessmentDocument, payload: Payload, actorId = "configurator-demo") => {
    const { assessmentId: _assessmentId, attemptId: _attemptId, page: _page, ...base } = request(state);
    return applyAssessmentCommand(state, { ...base, ...payload, actorId } as AssessmentCommand, context,
      { assessmentId: `assessment-${state.revision}`, attemptId: `attempt-${state.revision}`, historyId: `history-${state.revision}`, occurredAt: backupTime });
  };
  const assignment = assessmentAttemptAssignment(fixture.document.assessments[0].attempts[0]);
  const create: Payload = { type: "create", draft: { kind: "exam", title: "Экзамен", groupId: "group-1", subjectId: "subject-1", period: "2026/2027", attempt: assignment } };
  const initial = execute(emptyAssessmentDocument(), create);
  return { context, request, execute, assignment, create, initial };
};

describe("paginated assessment assignment history", () => {
  it("returns only the selected attempt, newest first, with stable boundaries for equal timestamps", () => {
    const { initial, assignment, execute, request, context, create } = setup();
    let state = initial;
    const ids = { assessmentId: "assessment-0", attemptId: "attempt-0" };
    for (let index = 0; index < 44; index += 1) state = execute(state, { type: "update-attempt", ...ids, draft: { ...assignment, room: `А-${index}` } });
    state = execute(state, create);
    state = execute(state, { type: "save-results", ...ids, results: [{ studentId: "student-1", outcome: { status: "graded", grade: 5 } }] }, "teacher-1");
    state = execute(state, { type: "publish", ...ids }, "teacher-1");
    const before = JSON.stringify(state);
    const pages = [1, 2, 3].map((page) => readAssessmentAttemptHistory(state, { ...request(state), page }, context));
    expect(pages.map((page) => [page.total, page.pages, page.items.length])).toEqual([[45, 3, 20], [45, 3, 20], [45, 3, 5]]);
    expect(pages.flatMap((page) => page.items.map((entry) => entry.id))).toEqual(Array.from({ length: 45 }, (_, index) => `history-${44 - index}`));
    expect(readAssessmentAttemptHistory(state, { ...request(state), page: 1000 }, context)).toEqual(pages[2]);
    const entry = pages[0].items[0];
    expect(entry).not.toHaveProperty("results"); expect(entry).not.toHaveProperty("recordBook"); expect(entry.assignment).not.toHaveProperty("studentIds");
    entry.assignment!.memberIds.push("local-only"); entry.assignment!.room = "Изменено в интерфейсе";
    expect(JSON.stringify(state)).toBe(before);
  });
  it("preserves cancellation reasons and legacy provenance without returning other audit actions", () => {
    const { initial, execute, request, context } = setup();
    const state = execute(initial, { type: "cancel-attempt", assessmentId: "assessment-0", attemptId: "attempt-0", reason: "Перенос экзамена" });
    state.history[0].assignmentOrigin = "legacy-snapshot";
    const page = readAssessmentAttemptHistory(state, request(state), context);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ action: "attempt-cancelled", reason: "Перенос экзамена" });
    expect(page.items[1]).toMatchObject({ action: "created", assignmentOrigin: "legacy-snapshot" });
    expect(page.revision).toBe(state.revision);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid page %s", (page) => {
    const { initial, request, context } = setup();
    expect(() => readAssessmentAttemptHistory(initial, { ...request(initial), page }, context)).toThrow("страницу");
  });
  it.each(["teacher-1", "student-1"])("does not expose history to %s even for a visible attempt", (actorId) => {
    const { initial, request, context } = setup();
    expect(() => readAssessmentAttemptHistory(initial, { ...request(initial), actorId }, context)).toThrow("только настройщику");
  });
  it.each(["expectedRevision", "accountsRevision", "groupRevision", "subjectRevision", "actorRevision"] as const)("rejects stale %s", (field) => {
    const { initial, request, context } = setup(); const input = request(initial);
    expect(() => readAssessmentAttemptHistory(initial, { ...input, [field]: input[field] + 1 }, context)).toThrow(/изменились|изменена/);
  });
  it("requires an active actor and the exact assessment/attempt pair", () => {
    const { initial, request, context } = setup();
    for (const change of [{ assessmentId: "missing" }, { attemptId: "missing" }]) expect(() => readAssessmentAttemptHistory(initial, { ...request(initial), ...change }, context)).toThrow("недоступна");
    context.accounts.find((account) => account.id === "configurator-demo")!.status = "blocked";
    expect(() => readAssessmentAttemptHistory(initial, request(initial), context)).toThrow("Учётная запись");
  });
});
