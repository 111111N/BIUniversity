import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAccountsDocument } from "./accounts";
import { inspectArchivedStudentOperations } from "./backupStudentOperations";
import { inspectBackupDocuments } from "./localBackupDocuments";
import type { StudentBulkAction } from "./studentBulkReceipt";
import { coreBackupFixture, studentOperationBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Operation inspection must not read or write current data"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const actions: StudentBulkAction[] = [{ kind: "transfer", groupId: "group-2" }, { kind: "graduated" }, { kind: "withdrawn" }];

describe("archived student operation snapshots and audit", () => {
  it.each(actions)("accepts a receipt produced by the actual command without requiring education events: %j", async (action) => {
    const state = studentOperationBackupFixture(action); const before = JSON.stringify(state.accounts);
    const result = await inspectArchivedStudentOperations(state.accounts);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("согласовано изменённых строк с аудитом: 1; без изменения: 0; требуют проверки: 0");
    expect(JSON.stringify(state.accounts)).toBe(before); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(() => decodeAccountsDocument(before)).not.toThrow();
  });
  it("also accepts a modern operation with linked educational events", async () => {
    const state = studentOperationBackupFixture(undefined, { effectiveDate: "2026-10-28", basis: "PRIVATE BASIS" });
    expect((await inspectBackupDocuments(state.archive, "configurator-demo")).issues).toEqual([]);
  });
  it("reports a contradictory legacy snapshot that passes the existing document schema", async () => {
    const state = studentOperationBackupFixture(); state.row.after.groupId = state.row.before.groupId; state.save();
    expect(() => decodeAccountsDocument(JSON.stringify(state.accounts))).not.toThrow();
    const before = JSON.stringify(state.archive); const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ kind: "accounts", level: "error", code: "student-operation-snapshot-conflict" })]);
    expect(review.checks[0].status).toBe("valid"); expect(JSON.stringify(review)).not.toContain("PRIVATE");
    expect(JSON.stringify(state.archive)).toBe(before);
  });
  it.each(["transfer-enrollment", "graduation-group", "graduation-result", "outcome"])("finds a receipt/action contradiction: %s", async (mode) => {
    const state = studentOperationBackupFixture(mode.startsWith("graduation") ? { kind: "graduated" } : undefined);
    if (mode === "transfer-enrollment") state.row.after.enrollment = "withdrawn";
    if (mode === "graduation-group") state.row.after.groupId = "group-2";
    if (mode === "graduation-result") state.row.after.enrollment = "withdrawn";
    if (mode === "outcome") state.row.outcome = "unchanged";
    expect((await inspectArchivedStudentOperations(state.accounts)).issues).toEqual([expect.objectContaining({ code: "student-operation-snapshot-conflict", level: "error" })]);
  });
  it("does not compare historical receipts with later account roles, states or renamed group labels", async () => {
    const state = studentOperationBackupFixture(); const student = state.accounts.accounts[2];
    student.role = "teacher"; student.studentGroupId = "later-group"; student.enrollmentStatus = "withdrawn";
    state.row.before.groupName = "PRIVATE RENAMED"; state.row.after.groupName = "PRIVATE OTHER LABEL";
    expect((await inspectArchivedStudentOperations(state.accounts)).issues).toEqual([]);
  });
  it("does not require audit for unchanged rows and ignores changes in labels when deciding equality", async () => {
    const state = studentOperationBackupFixture();
    state.accounts.accounts.push({ ...state.accounts.accounts[2], id: "student-noop", login: "student-noop", revision: 1 });
    state.operation.rows.push({ accountId: "student-noop", outcome: "unchanged", before: { ...state.row.after, groupName: "PRIVATE OLD LABEL" }, after: { ...state.row.after, groupName: "PRIVATE NEW LABEL" } });
    expect(() => decodeAccountsDocument(JSON.stringify(state.accounts))).not.toThrow();
    const result = await inspectArchivedStudentOperations(state.accounts);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("без изменения: 1; требуют проверки: 0");
  });
  it("keeps missing audit unresolved instead of borrowing another action", async () => {
    const state = studentOperationBackupFixture(); delete state.audit.studentOperationBatchId;
    expect((await inspectArchivedStudentOperations(state.accounts)).issues).toEqual([expect.objectContaining({ level: "review", code: "missing-student-operation-audit" })]);
  });
  it.each(["two-actions", "duplicate-id", "blank-id"])("does not choose a winning audit from %s", async (mode) => {
    const state = studentOperationBackupFixture();
    if (mode === "two-actions") state.accounts.history.push({ ...state.audit, id: "other-action" });
    if (mode === "duplicate-id") state.accounts.history.push({ ...state.audit, action: "created", studentOperationBatchId: undefined });
    if (mode === "blank-id") state.audit.id = "";
    expect((await inspectArchivedStudentOperations(state.accounts)).issues).toEqual([expect.objectContaining({ level: "review", code: "ambiguous-student-operation-audit" })]);
  });
  it.each(["actor", "action", "before", "after", "field"])("reports audit metadata or value disagreement: %s", async (mode) => {
    const state = studentOperationBackupFixture();
    if (mode === "actor") state.audit.actorId = "another-declared-author";
    if (mode === "action") state.audit.action = "created";
    if (mode === "before") state.audit.changes![0].before = "other-before";
    if (mode === "after") state.audit.changes![0].after = "other-after";
    if (mode === "field") state.audit.changes![0].field = "enrollmentStatus";
    const result = await inspectArchivedStudentOperations(state.accounts);
    expect(result.issues).toEqual([expect.objectContaining({ level: "error", code: "student-operation-audit-conflict" })]);
    expect(JSON.stringify(result)).not.toContain("other-before"); expect(JSON.stringify(result)).not.toContain("other-after");
  });
  it.each(["missing", "multiple"])("keeps %s audit values unresolved without filling them from the receipt", async (mode) => {
    const state = studentOperationBackupFixture();
    if (mode === "missing") delete state.audit.changes;
    else state.audit.changes!.push({ ...state.audit.changes![0] });
    expect((await inspectArchivedStudentOperations(state.accounts)).issues).toEqual([expect.objectContaining({ level: "review", code: "unresolved-student-operation-audit-values" })]);
  });
  it("uses distinct compound identifiers without colon-joined lookup collisions", async () => {
    const state = studentOperationBackupFixture();
    state.operation.id = "a:b"; state.row.accountId = "c"; state.audit.studentOperationBatchId = "a"; state.audit.accountId = "b:c";
    expect((await inspectArchivedStudentOperations(state.accounts)).issues[0].code).toBe("missing-student-operation-audit");
  });
  it("preserves all rows beyond 200 and allows cancellation", async () => {
    const state = studentOperationBackupFixture(); state.accounts.history = [];
    state.operation.rows = Array.from({ length: 205 }, (_, index) => ({ ...state.row, accountId: `student-${index}` }));
    const result = await inspectArchivedStudentOperations(state.accounts); expect(result.issues).toHaveLength(205);
    expect(new Set(result.issues.map((issue) => issue.recordId)).size).toBe(205);
    const controller = new AbortController(); const pending = inspectArchivedStudentOperations(state.accounts, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("leaves documents without operations quiet and skips unreadable source subsets", async () => {
    expect(await inspectArchivedStudentOperations(coreBackupFixture().accounts)).toEqual({ issues: [], summary: "" });
    const state = studentOperationBackupFixture(); state.operation.rows = []; state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks[0].status).toBe("invalid"); expect(review.issues.some((issue) => issue.code.startsWith("student-operation-"))).toBe(false);
  });
});
