import { describe, expect, it } from "vitest";
import { applyStudentBulk, previewStudentBulk, studentBulkSourceKey, type ApplyStudentBulkCommand, type StudentBulkRequest } from "./studentBulk";
import { createInitialAccountsDocument } from "../data/accountStore";
import { decodeAccountsDocument } from "./accounts";

const groups = [{ id: "112-mko", name: "112-МКо" }, { id: "new-group", name: "101-ИВТ" }, { id: "archive", name: "Архивная группа", status: "archived" as const }];
const request: StudentBulkRequest = { targets: [{ accountId: "anna-smirnova", revision: 1 }], action: { kind: "transfer", groupId: "new-group" } };
const command = (input = request): ApplyStudentBulkCommand => ({ actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0, expectedGroupRevision: 0, request: input, batchId: "bulk-one", fingerprint: "a".repeat(64) });
const date = "2026-10-26T10:00:00Z";

describe("student batch operations", () => {
  it("previews transfer with before/after without mutating the source", () => {
    const state = createInitialAccountsDocument(); const before = JSON.stringify(state);
    expect(previewStudentBulk(state, groups, request)).toMatchObject({ changed: 1, errors: 0, rows: [{ before: { groupId: "112-mko", enrollment: "studying" }, after: { groupId: "new-group", enrollment: "studying" } }] });
    expect(JSON.stringify(state)).toBe(before);
  });
  it("retains ID, access and number while clearing old group memberships on transfer", () => {
    const state = createInitialAccountsDocument(); const student = state.accounts.find((account) => account.id === "anna-smirnova")!;
    student.status = "blocked"; student.studentRecord = { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: date };
    const result = applyStudentBulk(state, command(), groups, 0, date, ["audit"]);
    expect(result.state.accounts.find((account) => account.id === student.id)).toMatchObject({ id: student.id, status: "blocked", studentRecord: student.studentRecord, studentGroupId: "new-group", memberships: [], revision: 2 });
    expect(result.state.history.at(-1)).toMatchObject({ action: "details-changed", studentOperationBatchId: "bulk-one", changes: [{ field: "group", before: "112-mko", after: "new-group" }] });
    expect(decodeAccountsDocument(JSON.stringify(result.state))).toEqual(result.state);
  });
  it.each(["graduated", "withdrawn"] as const)("changes only learning state for %s", (kind) => {
    const state = createInitialAccountsDocument(); const student = state.accounts[1];
    const result = applyStudentBulk(state, command({ ...request, action: { kind } }), groups, 0, date, ["audit"]);
    expect(result.state.accounts[1]).toMatchObject({ enrollmentStatus: kind, memberships: student.memberships, login: student.login });
    expect(result.receipt.rows[0].after.groupId).toBe("112-mko");
  });
  it("marks no-op rows and rejects incompatible completed states, archived targets and stale rows", () => {
    const state = createInitialAccountsDocument(); state.accounts[1].enrollmentStatus = "graduated";
    expect(previewStudentBulk(state, groups, { ...request, action: { kind: "graduated" } }).unchanged).toBe(1);
    expect(previewStudentBulk(state, groups, request).errors).toBe(1);
    expect(previewStudentBulk(state, groups, { ...request, action: { kind: "withdrawn" } }).errors).toBe(1);
    expect(previewStudentBulk(createInitialAccountsDocument(), groups, { ...request, action: { kind: "transfer", groupId: "archive" } }).errors).toBe(1);
    expect(previewStudentBulk(createInitialAccountsDocument(), groups, { ...request, targets: [{ accountId: "anna-smirnova", revision: 2 }] }).errors).toBe(1);
    expect(previewStudentBulk(state, groups, { ...request, targets: [{ accountId: "teacher-elena-volkova", revision: 1 }] }).errors).toBe(1);
  });
  it("requires distinct, bounded targets and canonicalizes target order for retry", () => {
    expect(() => studentBulkSourceKey({ ...request, targets: [] })).toThrow("Выберите");
    expect(() => studentBulkSourceKey({ ...request, targets: [...request.targets, ...request.targets] })).toThrow("разных");
    expect(() => studentBulkSourceKey({ ...request, targets: Array.from({ length: 1001 }, (_, index) => ({ accountId: `student-${index}`, revision: 1 })) })).toThrow("1000");
    const many = { ...request, targets: [...request.targets, { accountId: "second", revision: 3 }] };
    expect(studentBulkSourceKey(many)).toBe(studentBulkSourceKey({ ...many, targets: many.targets.slice().reverse() }));
  });
  it("replays a completed batch without writes but rechecks author and prevents batch reuse", () => {
    const result = applyStudentBulk(createInitialAccountsDocument(), command(), groups, 0, date, ["audit"]);
    const replay = applyStudentBulk(result.state, command(), groups, 999, date, ["other-audit"]);
    expect(replay.replayed).toBe(true); expect(replay.state).toBe(result.state);
    expect(() => applyStudentBulk(result.state, { ...command(), fingerprint: "b".repeat(64) }, groups, 0, date, ["other-audit"])).toThrow("другому");
    expect(() => applyStudentBulk(result.state, { ...command(), actorId: "anna-smirnova" }, groups, 0, date, ["other-audit"])).toThrow("настройщику");
    expect(() => applyStudentBulk(createInitialAccountsDocument(), { ...command(), expectedGroupRevision: 1 }, groups, 0, date, ["audit"])).toThrow("групп изменился");
  });
});
