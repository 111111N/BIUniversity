import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "./accountStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { decodeAccountsDocument } from "../domain/accounts";

let values: Map<string, string>; let writes: number;
beforeEach(() => { values = new Map(); writes = 0; vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {}); vi.spyOn(console, "error").mockImplementation(() => undefined); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T10:00:00Z")); refreshAcademicCatalog(); });
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const education = { effectiveDate: "2026-09-01", basis: "Приказ о зачислении" };
const admission = () => accountService.confirmAdmission({ ...actor, expectedRevision: 0, accountId: "anna-smirnova", accountRevision: 1, expectedGroupRevision: 0, education });

describe("education aggregate adapter", () => {
  it("commits a thousand dated events with their audit and receipt in one aggregate write", async () => {
    const state = createInitialAccountsDocument(); const base = state.accounts[1];
    state.accounts = [...state.accounts.filter((account) => account.role !== "student"), ...Array.from({ length: 1000 }, (_, index) => ({ ...base, id: `dated-${index}`, login: `dated.${index}` }))];
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    const plan = await accountService.previewStudentOperation({ ...actor, accountIds: state.accounts.filter((account) => account.role === "student").map((account) => account.id), action: { kind: "graduated" }, education });
    await accountService.applyStudentOperation({ ...actor, expectedRevision: plan.expectedRevision, expectedGroupRevision: plan.groupRevision, batchId: "thousand-events", request: plan.request, fingerprint: plan.fingerprint });
    expect(writes).toBe(1); const result = readAccountsState(); expect(result.error).toBe(""); expect(result.educationEvents).toHaveLength(1000); expect(result.history).toHaveLength(1000); expect(result.revision).toBe(1);
  });
  it("saves admission, audit and current record in one write; rejects a duplicate submission", async () => {
    await admission(); expect(writes).toBe(1); expect(readAccountsState().educationEvents).toHaveLength(1);
    await expect(admission()).rejects.toThrow(); expect(writes).toBe(1);
    expect(decodeAccountsDocument(values.get(ACCOUNTS_STORAGE_KEY)!)).toBeTruthy();
  });
  it("records individual transfer atomically and keeps its effective date distinct from registration", async () => {
    await admission();
    await accountService.updateDetails({ ...actor, expectedRevision: 1, accountId: "anna-smirnova", accountRevision: 2, education: { ...education, effectiveDate: "2026-10-01" }, details: { name: "Анна Смирнова", login: "anna.smirnova", studentGroupId: "113-mko", memberships: [] } });
    const state = readAccountsState(); expect(state.error).toBe(""); expect(writes).toBe(2);
    expect(state.educationEvents.at(-1)).toMatchObject({ effectiveDate: "2026-10-01", registeredAt: "2026-10-26T10:00:00.000Z", kind: "transferred" });
    const stored = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(accountService.updateDetails({ ...actor, expectedRevision: 2, accountId: "anna-smirnova", accountRevision: 3, education: { ...education, effectiveDate: "2026-09-10" }, details: { name: "Анна Смирнова", login: "anna.smirnova", enrollmentStatus: "graduated" } })).rejects.toThrow("раньше");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(stored);
  });
  it("binds batch metadata, replays without a second write, and refuses future events", async () => {
    const plan = await accountService.previewStudentOperation({ ...actor, accountIds: ["anna-smirnova"], action: { kind: "graduated" }, education });
    const command = { ...actor, expectedRevision: plan.expectedRevision, expectedGroupRevision: plan.groupRevision, batchId: "education-batch", request: plan.request, fingerprint: plan.fingerprint };
    await expect(accountService.applyStudentOperation({ ...command, request: { ...plan.request, education: { ...education, basis: "Другое основание" } } })).rejects.toThrow("изменились");
    await accountService.applyStudentOperation(command); await accountService.applyStudentOperation(command);
    expect(writes).toBe(1); expect(readAccountsState().educationEvents).toHaveLength(1);
    await expect(accountService.previewStudentOperation({ ...actor, accountIds: ["anna-smirnova"], action: { kind: "withdrawn" }, education: { ...education, effectiveDate: "2026-10-27" } })).rejects.toThrow("Дата действия");
  });
  it("leaves original bytes intact when storage fails", async () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: () => { throw new Error("Quota exceeded"); } });
    await expect(admission()).rejects.toThrow("Quota"); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
  });
});
