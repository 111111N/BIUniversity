import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, readAccountsState } from "./accountStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
import { decodeAccountsDocument } from "../domain/accounts";
import type { StudentImportPreview, StudentImportRequest } from "../domain/studentImport";

let values: Map<string, string>;
let writes: number;
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const input: StudentImportRequest = { defaultGroupId: "112-mko", defaultCampus: 3, rows: [{ line: 2, name: "Новый Студент", login: "new.student", email: "", group: "", campus: "" }, { line: 3, name: "Второй Студент", login: "second.student", email: "", group: "", campus: "" }] };
const preview = (request = input) => accountService.previewStudentsImport({ ...actor, request });
const command = (plan: StudentImportPreview, batchId = "batch-one", request = input) => ({ ...actor, expectedRevision: plan.expectedRevision, expectedGroupRevision: plan.groupRevision, expectedYear: plan.year, expectedStudentNumbers: plan.rows.filter((row) => row.status === "ready").map((row) => row.studentNumber!), batchId, fingerprint: plan.fingerprint, request });

describe("atomic student import adapter", () => {
  it("does not reserve on preview and writes students, counters, audit and receipt in one operation", async () => {
    const plan = await preview(); expect(writes).toBe(0);
    expect(plan.rows.map((row) => row.studentNumber)).toEqual(["202630001", "202630002"]);
    const result = await accountService.importStudents(command(plan));
    expect(result.replayed).toBe(false); expect(writes).toBe(1);
    expect(readAccountsState().accounts).toHaveLength(5);
    expect(readAccountsState().studentImports[0]).toEqual(result.receipt);
    expect(decodeAccountsDocument(values.get(ACCOUNTS_STORAGE_KEY)!)).toMatchObject({ revision: 1, studentNumberCounters: { "2026:3": 2 } });
  });
  it("recognizes a repeated list after a reload/new batch ID and never allocates twice", async () => {
    const plan = await preview();
    const first = await accountService.importStudents(command(plan));
    const retry = await accountService.importStudents(command(plan, "different-batch"));
    expect(retry.replayed).toBe(true); expect(retry.receipt).toEqual(first.receipt); expect(writes).toBe(1);
    expect((await preview()).previousImport).toEqual(first.receipt);
    expect((await accountService.previewStudentNumber({ ...actor, campus: 3 })).number).toBe("202630003");
  });
  it("serializes simultaneous delivery of the same batch", async () => {
    const plan = await preview();
    const results = await Promise.all([accountService.importStudents(command(plan)), accountService.importStudents(command(plan))]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]); expect(writes).toBe(1); expect(readAccountsState().accounts).toHaveLength(5);
  });
  it("rejects a changed request under a previously reviewed fingerprint", async () => {
    const plan = await preview();
    await expect(accountService.importStudents(command(plan, "batch-one", { ...input, rows: [{ ...input.rows[0], login: "forged.student" }] }))).rejects.toThrow("Список изменился");
    expect(writes).toBe(0);
  });
  it("keeps all accounts unchanged on a write failure and allows the same exact packet to be retried", async () => {
    const plan = await preview();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: () => { throw new Error("Quota exceeded"); } });
    await expect(accountService.importStudents(command(plan))).rejects.toThrow("Quota"); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
    await accountService.importStudents(command(plan)); expect(readAccountsState().accounts).toHaveLength(5); expect(writes).toBe(1);
  });
  it("requires an explicit fresh preview after another student consumed the first number", async () => {
    const plan = await preview();
    await accountService.create({ ...actor, expectedRevision: 0, expectedStudentNumber: "202630001", draft: { name: "Другой Студент", login: "concurrent.student", role: "student", studentGroupId: "112-mko", studentCampus: 3, memberships: [] } });
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(accountService.importStudents(command(plan))).rejects.toThrow("изменились"); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before);
    const fresh = await preview(); expect(fresh.rows[0].studentNumber).toBe("202630002");
    await accountService.importStudents(command(fresh)); expect(readAccountsState().accounts).toHaveLength(6);
  });
  it("does not replace corrupt group or account storage", async () => {
    const plan = await preview();
    values.set(GROUP_CATALOG_STORAGE_KEY, "broken groups");
    await expect(accountService.importStudents(command(plan))).rejects.toThrow("недоступен"); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false); expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe("broken groups");
    values.delete(GROUP_CATALOG_STORAGE_KEY); refreshAcademicCatalog(); values.set(ACCOUNTS_STORAGE_KEY, "broken accounts");
    await expect(preview()).rejects.toThrow(); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe("broken accounts");
  });
  it("retains packet receipts during later profile updates and role changes", async () => {
    const first = await accountService.importStudents(command(await preview()));
    const student = readAccountsState().accounts.at(-1)!;
    const teacher = await accountService.changeRole({ ...actor, expectedRevision: 1, accountId: student.id, accountRevision: student.revision, role: "teacher", memberships: [] });
    expect(teacher.studentRecord?.number).toBe("202630002");
    expect(readAccountsState().studentImports[0]).toEqual(first.receipt);
    expect((await preview()).previousImport).toEqual(first.receipt);
  });
  it("rejects corrupted receipts without rewriting any source bytes", async () => {
    await accountService.importStudents(command(await preview()));
    const raw = JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!);
    raw.studentImports[0].created[0].studentNumber = "202690001";
    const damaged = JSON.stringify(raw); values.set(ACCOUNTS_STORAGE_KEY, damaged);
    expect(readAccountsState().error).toBeTruthy(); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(damaged);
  });
  it("processes a thousand students with unique identities and a single aggregate revision", async () => {
    const request = { ...input, rows: Array.from({ length: 1000 }, (_, index) => ({ ...input.rows[0], line: index + 2, name: `Студент ${index}`, login: `bulk.student.${index}` })) };
    const plan = await preview(request); expect(plan.ready).toBe(1000);
    await accountService.importStudents(command(plan, "batch-thousand", request));
    const state = readAccountsState(); expect(state.error).toBe(""); expect(state.accounts).toHaveLength(1003); expect(state.revision).toBe(1); expect(writes).toBe(1);
    expect(new Set(state.accounts.flatMap((account) => account.studentRecord ? [account.studentRecord.number] : [])).size).toBe(1000);
  });
});
