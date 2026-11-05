import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAccountsDocument } from "./accounts";
import { inspectArchivedStudentImports } from "./backupStudentImports";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { coreBackupFixture, studentImportBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Import audit checks must not access live stores"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived student import creation audit", () => {
  it("accepts an import produced by the actual command without exposing personal data", async () => {
    const state = studentImportBackupFixture(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues).toEqual([]); expect(review.checks[0].message).toContain("согласовано с аудитом: 1; требуют проверки: 0");
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain(state.receipt.created[0].studentNumber);
    expect(JSON.stringify(state.archive)).toBe(before);
  });
  it("does not require new creation events for skipped existing students", async () => {
    const state = studentImportBackupFixture(true);
    expect(state.receipt.skipped).toHaveLength(1);
    const result = await inspectArchivedStudentImports(state.accounts);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("существующих строк без повторного создания: 1");
  });
  it("exposes missing audit as review while preserving a readable legacy document", async () => {
    const state = studentImportBackupFixture(); state.accounts.history = []; state.save();
    expect(() => decodeAccountsDocument(JSON.stringify(state.accounts))).not.toThrow();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks[0].status).toBe("valid"); expect(review.counts).toMatchObject({ errors: 0, reviews: 1 });
    expect(review.issues).toEqual([expect.objectContaining({ level: "review", code: "missing-student-import-audit" })]);
  });
  it.each(["duplicate-link", "duplicate-id", "blank-id"])("keeps %s unresolved instead of picking an event", async (mode) => {
    const state = studentImportBackupFixture();
    if (mode === "duplicate-link") state.accounts.history.push({ ...state.audit, id: "second" });
    if (mode === "duplicate-id") state.accounts.history.push({ ...state.audit, importBatchId: undefined });
    if (mode === "blank-id") state.audit.id = "";
    expect((await inspectArchivedStudentImports(state.accounts)).issues).toEqual([expect.objectContaining({ level: "review", code: "ambiguous-student-import-audit" })]);
  });
  it.each(["actor", "action", "previous-role", "next-role"])("detects contradictory creation metadata: %s", async (mode) => {
    const state = studentImportBackupFixture();
    if (mode === "actor") state.audit.actorId = "other-author";
    if (mode === "action") state.audit.action = "details-changed";
    if (mode === "previous-role") state.audit.previousRole = "teacher";
    if (mode === "next-role") state.audit.nextRole = "teacher";
    expect((await inspectArchivedStudentImports(state.accounts)).issues).toEqual([expect.objectContaining({ level: "error", code: "student-import-audit-conflict" })]);
  });
  it("does not derive creation metadata or historical rights from the current account or author", async () => {
    const state = studentImportBackupFixture(); const account = state.accounts.accounts.find((row) => row.id === "imported-student")!;
    account.role = "teacher"; account.status = "blocked"; account.name = "PRIVATE RENAMED";
    state.receipt.actorId = "former-actor"; state.audit.actorId = "former-actor";
    const result = await inspectArchivedStudentImports(state.accounts);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("полномочия автора этой сверкой не подтверждаются");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("uses exact batch/account identifiers without searching by login or number", async () => {
    const state = studentImportBackupFixture(); state.receipt.id = "a:b"; state.receipt.created[0].accountId = "c";
    state.audit.importBatchId = "a"; state.audit.accountId = "b:c";
    expect((await inspectArchivedStudentImports(state.accounts)).issues[0].code).toBe("missing-student-import-audit");
  });
  it("retains every missing creation beyond 200 and supports cancellation", async () => {
    const state = studentImportBackupFixture(); state.accounts.history = [];
    state.receipt.created = Array.from({ length: 205 }, (_, index) => ({ ...state.receipt.created[0], line: index + 2, accountId: `created-${index}` }));
    const result = await inspectArchivedStudentImports(state.accounts);
    expect(result.issues).toHaveLength(205); expect(new Set(result.issues.map((issue) => issue.recordId)).size).toBe(205);
    const controller = new AbortController(); const pending = inspectArchivedStudentImports(state.accounts, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps documents without imports quiet and skips invalid source subsets", async () => {
    expect(await inspectArchivedStudentImports(coreBackupFixture().accounts)).toEqual({ issues: [], summary: "" });
    const state = studentImportBackupFixture(); state.receipt.created[0].studentNumber = "PRIVATE"; state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks[0].status).toBe("invalid"); expect(result.issues.some((issue) => issue.code.includes("student-import-audit"))).toBe(false);
  });
});
