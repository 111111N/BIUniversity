import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountChange } from "./accounts";
import { inspectArchivedStudentNumberHistory } from "./backupStudentNumberHistory";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { previewStudentNumber } from "./studentRecord";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Issuance checks must use archive data only"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const fixture = () => {
  const state = coreBackupFixture();
  state.accounts.accounts[2].studentRecord = { number: "202630012", year: 2026, campus: 3, sequence: 12, issuedAt: "2026-01-01T09:00:00.000Z" };
  state.accounts.studentNumberCounters = { "2026:3": 20 };
  const issuance: AccountChange = { id: "issue-1", actorId: "configurator-demo", accountId: "student-1", occurredAt: "2026-01-01T09:00:00.000Z", action: "student-number-issued", previousRole: "student", nextRole: "student", changes: [{ field: "studentNumber", before: "", after: "202630012" }] };
  state.accounts.history = [issuance];
  return { ...state, issuance };
};

describe("archived explicit student-number issuance", () => {
  it("matches a declared issuance by account ID without changing numbers, counters or the next preview", async () => {
    const state = fixture(); const before = JSON.stringify(state.accounts);
    const preview = previewStudentNumber(state.accounts, 3, "2026-11-03T09:00:00Z");
    const result = await inspectArchivedStudentNumberHistory(state.accounts);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("согласовано с учётками: 1; требуют проверки: 0");
    expect(JSON.stringify(result)).not.toContain("202630012"); expect(JSON.stringify(state.accounts)).toBe(before);
    expect(previewStudentNumber(state.accounts, 3, "2026-11-03T09:00:00Z")).toEqual(preview);
    expect(preview.number).toBe("202630021");
  });
  it("reports contradictory numbers as an error without choosing the current or historical value", async () => {
    const state = fixture(); state.issuance.changes![0].after = "202630013"; state.save();
    const before = JSON.stringify(state.archive); const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues).toEqual([expect.objectContaining({ kind: "accounts", level: "error", code: "student-number-history-conflict", recordId: '["history","issue-1",1]' })]);
    expect(review.checks[0].status).toBe("valid"); expect(review.counts).toMatchObject({ errors: 1, invalid: 0 });
    expect(JSON.stringify(review)).not.toContain("202630012"); expect(JSON.stringify(review)).not.toContain("202630013");
    expect(JSON.stringify(state.archive)).toBe(before);
  });
  it.each(["missing-account", "missing-record"])("keeps a %s unresolved without assigning a number", async (mode) => {
    const state = fixture();
    if (mode === "missing-account") state.issuance.accountId = "gone";
    else delete state.accounts.accounts[2].studentRecord;
    const result = await inspectArchivedStudentNumberHistory(state.accounts);
    expect(result.issues).toEqual([expect.objectContaining({ level: "review", code: mode === "missing-account" ? "missing-student-number-history-account" : "missing-student-number-history-record" })]);
    expect(result.summary).toContain("согласовано с учётками: 0; требуют проверки: 1");
  });
  it.each([
    { changes: undefined }, { changes: [] },
    { changes: [{ field: "studentNumber", before: "", after: "PRIVATE" }] },
    { changes: [{ field: "studentNumber", before: "old", after: "202630012" }] },
    { changes: [{ field: "studentNumber", before: "", after: "202630000" }] },
    { changes: [{ field: "studentNumber", before: "", after: "202630012\n" }] },
    { changes: [{ field: "studentNumber", before: "", after: "202630012" }, { field: "studentNumber", before: "", after: "202630012" }] },
  ])("does not infer an issuance value from incomplete or ambiguous changes: %j", async ({ changes }) => {
    const state = fixture(); state.issuance.changes = changes;
    const result = await inspectArchivedStudentNumberHistory(state.accounts);
    expect(result.issues).toEqual([expect.objectContaining({ level: "review", code: "unresolved-student-number-history-value" })]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("retains each ambiguous event with a distinct technical row reference instead of collapsing duplicate IDs", async () => {
    const state = fixture(); state.accounts.history = Array.from({ length: 205 }, () => ({ ...state.issuance }));
    const result = await inspectArchivedStudentNumberHistory(state.accounts);
    expect(result.issues).toHaveLength(205); expect(new Set(result.issues.map((issue) => issue.recordId)).size).toBe(205);
    expect(result.issues.every((issue) => issue.code === "unresolved-student-number-history-id")).toBe(true);
  });
  it("does not treat an ID duplicated by another action or a blank ID as a uniquely identified event", async () => {
    const state = fixture(); state.accounts.history.push({ ...state.issuance, action: "created" });
    expect((await inspectArchivedStudentNumberHistory(state.accounts)).issues[0].code).toBe("unresolved-student-number-history-id");
    state.accounts.history = [{ ...state.issuance, id: "" }];
    expect((await inspectArchivedStudentNumberHistory(state.accounts)).issues[0].code).toBe("unresolved-student-number-history-id");
  });
  it("does not require separate issuance events for creation, role changes, import or an older account", async () => {
    const state = fixture();
    state.accounts.history = [{ ...state.issuance, action: "created", changes: undefined }, { ...state.issuance, id: "role-1", action: "role-changed", changes: undefined }];
    expect(await inspectArchivedStudentNumberHistory(state.accounts)).toEqual({ issues: [], summary: "" });
    state.accounts.history = []; expect(await inspectArchivedStudentNumberHistory(state.accounts)).toEqual({ issues: [], summary: "" });
  });
  it("compares retained numbers after blocking or changing roles without inferring historical author rights", async () => {
    const state = fixture(); state.accounts.accounts[2].status = "blocked"; state.accounts.accounts[2].role = "teacher";
    state.issuance.actorId = "not-a-current-administrator";
    const result = await inspectArchivedStudentNumberHistory(state.accounts);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("не подтверждает подлинность истории, полномочия автора");
  });
  it("honours cancellation while examining a long history and does not inspect an invalid source subset", async () => {
    const state = fixture(); state.accounts.history = Array.from({ length: 205 }, (_, index) => ({ ...state.issuance, id: `issue-${index}` }));
    const controller = new AbortController(); const pending = inspectArchivedStudentNumberHistory(state.accounts, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    state.accounts.studentNumberCounters = { "2026:3": -1 }; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks[0].status).toBe("invalid");
    expect(result.issues.some((issue) => issue.code.startsWith("student-number-history") || issue.code.startsWith("unresolved-student-number-history"))).toBe(false);
  });
});
