import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import type { StudentBulkPreview } from "../../domain/studentBulk";
import { getStudentOperationProblems, type StudentOperationParameters } from "./operationParameters";
import { filterStudentOperationRows } from "./presentation";

let values: Map<string, string>; let writes: number;
const now = "2026-10-28T10:00:00Z";
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const selected = ["anna-smirnova", "student-two"];
const parameters: StudentOperationParameters = { kind: "transfer", targetGroupId: "113-mko", education: { effectiveDate: "2026-10-01", basis: "Приказ о переводе", documentNumber: "15-У", documentDate: "2026-09-30" } };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {}); vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); refreshAcademicCatalog();
  const state = createInitialAccountsDocument(); const student = state.accounts[1]; student.status = "blocked";
  student.studentRecord = { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: "2026-09-01T10:00:00Z" };
  state.accounts.push({ ...student, id: selected[1], login: "student.two", name: "Второй студент", studentRecord: { ...student.studentRecord, number: "202630002", sequence: 2 } });
  state.studentNumberCounters = { "2026:3": 2 }; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const preview = (input: StudentOperationParameters) => accountService.previewStudentOperation({ ...actor, accountIds: [...selected], action: input.kind === "transfer" ? { kind: input.kind, groupId: input.targetGroupId } : { kind: input.kind }, education: input.education });
const command = (plan: StudentBulkPreview) => ({ ...actor, expectedRevision: plan.expectedRevision, expectedGroupRevision: plan.groupRevision, request: plan.request, batchId: "corrected-student-operation", fingerprint: plan.fingerprint });

describe("student operation parameters with the aggregate adapter", () => {
  it("preserves the selection and document through correction, then commits the full preview separately", async () => {
    const invalid = { ...parameters, targetGroupId: "", education: { ...parameters.education, basis: "" } };
    const original = values.get(ACCOUNTS_STORAGE_KEY); const retained = structuredClone({ selected, parameters });
    expect(getStudentOperationProblems(invalid, readGroupCatalogState().groups, now).map((problem) => problem.field)).toEqual(["targetGroup", "basis"]);
    expect(writes).toBe(0); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(original);
    expect(getStudentOperationProblems(parameters, readGroupCatalogState().groups, now)).toEqual([]);
    const plan = await preview(parameters);
    expect(plan.errors).toBe(0); expect(plan.changed).toBe(2); expect(plan.request.targets.map((target) => target.accountId)).toEqual(selected);
    expect(plan.request.education).toEqual(parameters.education); expect(writes).toBe(0); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(original);
    const visible = filterStudentOperationRows(plan.rows, "changed", "Второй", new Map(readAccountsState().accounts.map((account) => [account.id, account])));
    expect(visible.map((row) => row.accountId)).toEqual([selected[1]]); expect(plan.request.targets).toHaveLength(2);
    await accountService.applyStudentOperation(command(plan));
    const saved = readAccountsState(); expect(saved.error).toBe(""); expect(writes).toBe(1); expect(saved.educationEvents).toHaveLength(2);
    expect(saved.studentOperations[0].rows.map((row) => row.accountId)).toEqual(selected);
    for (const id of selected) {
      const before = JSON.parse(original!).accounts.find((account: { id: string }) => account.id === id);
      expect(saved.accounts.find((account) => account.id === id)).toMatchObject({ studentGroupId: "113-mko", status: "blocked", studentRecord: before.studentRecord });
    }
    expect(JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!).studentNumberCounters).toEqual({ "2026:3": 2 });
    expect({ selected, parameters }).toEqual(retained);
  });
  it("keeps row chronology checks and rechecks every selected student after the common date is corrected", async () => {
    await accountService.confirmAdmission({ ...actor, expectedRevision: 0, accountId: selected[1], accountRevision: 1, expectedGroupRevision: 0, education: { effectiveDate: "2026-10-20", basis: "Зачисление второго студента" } });
    const original = values.get(ACCOUNTS_STORAGE_KEY);
    expect(getStudentOperationProblems(parameters, readGroupCatalogState().groups, now)).toEqual([]);
    const failed = await preview(parameters);
    expect(failed.errors).toBe(1); expect(failed.changed).toBe(1); expect(failed.rows[1].errors.join(" ")).toContain("раньше");
    await expect(accountService.applyStudentOperation(command(failed))).rejects.toThrow("Ничего не изменено");
    expect(writes).toBe(1); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(original);
    const corrected = { ...parameters, education: { ...parameters.education, effectiveDate: "2026-10-21" } };
    const plan = await preview(corrected);
    expect(plan.errors).toBe(0); expect(plan.changed).toBe(2); expect(plan.request.targets.map((target) => target.accountId)).toEqual(selected);
    expect(plan.request.education).toEqual(corrected.education); expect(writes).toBe(1); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(original);
    await accountService.applyStudentOperation(command(plan));
    const saved = readAccountsState(); expect(saved.error).toBe(""); expect(writes).toBe(2); expect(saved.educationEvents).toHaveLength(3);
    expect(saved.studentOperations).toHaveLength(1); expect(saved.studentOperations[0].rows).toHaveLength(2);
  });
});
