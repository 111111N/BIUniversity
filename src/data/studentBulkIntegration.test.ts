import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "./accountStore";
import { groupCatalogService, GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { decodeAccountsDocument } from "../domain/accounts";
import type { StudentBulkPreview } from "../domain/studentBulk";

let values: Map<string, string>; let writes: number;
beforeEach(() => { values = new Map(); writes = 0; vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {}); vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog(); });
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const preview = (ids = ["anna-smirnova"]) => accountService.previewStudentOperation({ ...actor, accountIds: ids, action: { kind: "graduated" } });
const command = (plan: StudentBulkPreview, batchId = "operation-one") => ({ ...actor, expectedRevision: plan.expectedRevision, expectedGroupRevision: plan.groupRevision, request: plan.request, batchId, fingerprint: plan.fingerprint });

describe("student batch adapter atomicity", () => {
  it("previews without writes and commits state, audit and result once", async () => {
    const plan = await preview(); expect(writes).toBe(0);
    const result = await accountService.applyStudentOperation(command(plan)); expect(writes).toBe(1); expect(result.replayed).toBe(false);
    const state = readAccountsState(); expect(state.revision).toBe(1); expect(state.accounts[1].enrollmentStatus).toBe("graduated"); expect(state.studentOperations).toEqual([result.receipt]);
    expect(decodeAccountsDocument(values.get(ACCOUNTS_STORAGE_KEY)!)).toBeTruthy();
    await accountService.applyStudentOperation(command(plan)); expect(writes).toBe(1);
  });
  it("does not partially apply a selection containing an error", async () => {
    const plan = await preview(["anna-smirnova", "teacher-elena-volkova"]); expect(plan.changed).toBe(1); expect(plan.errors).toBe(1);
    await expect(accountService.applyStudentOperation(command(plan))).rejects.toThrow("ошибки"); expect(writes).toBe(0); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
  });
  it("rejects changed payload, stale accounts/groups and preserves failed storage for retry", async () => {
    const plan = await preview(); await expect(accountService.applyStudentOperation({ ...command(plan), request: { ...plan.request, action: { kind: "withdrawn" } } })).rejects.toThrow("изменились");
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: () => { throw new Error("Quota exceeded"); } });
    await expect(accountService.applyStudentOperation(command(plan))).rejects.toThrow("Quota"); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
  });
  it("blocks an obsolete preview after other account changes and allows explicit refresh", async () => {
    const plan = await preview(); await accountService.updateDetails({ ...actor, expectedRevision: 0, accountId: "teacher-elena-volkova", accountRevision: 1, details: { name: "Елена Волкова Новая", login: "elena.volkova" } });
    await expect(accountService.applyStudentOperation(command(plan))).rejects.toThrow("изменились");
    const next = await preview(); await accountService.applyStudentOperation(command(next)); expect(readAccountsState().accounts[1].enrollmentStatus).toBe("graduated");
  });
  it("serializes double submissions under one receipt", async () => {
    const plan = await preview(); const outcomes = await Promise.all([accountService.applyStudentOperation(command(plan)), accountService.applyStudentOperation(command(plan))]);
    expect(outcomes.map((outcome) => outcome.replayed).sort()).toEqual([false, true]); expect(writes).toBe(1); expect(readAccountsState().history).toHaveLength(1);
  });
  it("keeps corrupt catalog/account bytes and refuses broken receipt references", async () => {
    const plan = await preview(); values.set(GROUP_CATALOG_STORAGE_KEY, "bad groups"); await expect(accountService.applyStudentOperation(command(plan))).rejects.toThrow("каталог"); expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe("bad groups"); values.delete(GROUP_CATALOG_STORAGE_KEY); refreshAcademicCatalog();
    await accountService.applyStudentOperation(command(plan)); const document = JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!); document.studentOperations[0].rows[0].accountId = "missing";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(document)); expect(readAccountsState().error).toBeTruthy(); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(JSON.stringify(document));
  });
  it("checks group revision again at transfer commit", async () => {
    const plan = await accountService.previewStudentOperation({ ...actor, accountIds: ["anna-smirnova"], action: { kind: "transfer", groupId: "113-mko" } });
    await groupCatalogService.create({ ...actor, expectedRevision: 0, draft: { name: "Новая группа", course: 1, campus: 3, admissionYear: 2026 } });
    await expect(accountService.applyStudentOperation(command(plan))).rejects.toThrow("Справочник групп"); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
  });
  it("changes a thousand students in one write and one document revision", async () => {
    const state = createInitialAccountsDocument(); const base = state.accounts[1];
    state.accounts = [...state.accounts.filter((account) => account.role !== "student"), ...Array.from({ length: 1000 }, (_, index) => ({ ...base, id: `student-${index}`, login: `student.${index}`, name: `Студент ${index}` }))]; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    const plan = await preview(state.accounts.filter((account) => account.role === "student").map((account) => account.id)); await accountService.applyStudentOperation(command(plan));
    expect(writes).toBe(1); const next = readAccountsState(); expect(next.error).toBe(""); expect(next.revision).toBe(1); expect(next.accounts.filter((account) => account.enrollmentStatus === "graduated")).toHaveLength(1000); expect(next.history).toHaveLength(1000);
  });
});
