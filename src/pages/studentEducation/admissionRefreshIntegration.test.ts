import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { applyAdmissionRefresh, makeAdmissionEditor, prepareAdmissionRefresh, type AdmissionEditor } from "./admissionRefresh";

let values: Map<string, string>; let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const now = "2026-10-28T10:00:00Z";
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {}); vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); refreshAcademicCatalog();
  const state = createInitialAccountsDocument(); state.accounts[1].status = "blocked";
  state.accounts[1].studentRecord = { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: "2026-09-01T10:00:00Z" };
  state.studentNumberCounters = { "2026:3": 1 }; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const source = () => { const groups = readGroupCatalogState(); return { ...readAccountsState(), actorId: actor.actorId, groups: groups.groups, groupRevision: groups.revision, groupError: groups.error }; };
const editor = () => ({ ...makeAdmissionEditor("anna-smirnova", { effectiveDate: "2026-10-28", basis: "" }, source()), education: { effectiveDate: "2026-09-01", basis: "Приказ о зачислении", documentNumber: "15-У", documentDate: "2026-08-30" } });
const command = (input: AdmissionEditor) => ({ actorId: input.actorId, actorRevision: input.actorRevision, expectedRevision: input.revision, accountId: input.account.id, accountRevision: input.account.revision, expectedGroupRevision: input.groupRevision, education: input.education });
const editCommand = (input: AdmissionEditor) => ({ ...actor, expectedRevision: input.revision, accountId: input.account.id, accountRevision: input.account.revision, details: { name: input.account.name, login: input.account.login, studentGroupId: "113-mko", memberships: [] } });

describe("admission refresh with the existing aggregate command", () => {
  it("requires review of a changed legacy group, then saves admission separately without changing number or access", async () => {
    const input = editor(); await accountService.updateDetails(editCommand(input));
    expect(readAccountsState().educationEvents).toEqual([]);
    const raw = values.get(ACCOUNTS_STORAGE_KEY); const review = prepareAdmissionRefresh(input, source(), now);
    expect(input.groupName).toBe("112-МКо"); expect(review.currentGroup).toBe("113-МКо");
    const next = applyAdmissionRefresh(input, review, source());
    expect(next.education).toEqual(input.education); expect(next.baseline).toEqual(input.baseline); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(writes).toBe(1);
    await accountService.confirmAdmission(command(next));
    const saved = readAccountsState(); const student = saved.accounts.find((entry) => entry.id === input.account.id)!;
    expect(writes).toBe(2); expect(student).toMatchObject({ studentGroupId: "113-mko", status: "blocked", studentRecord: input.account.studentRecord });
    expect(saved.educationEvents).toHaveLength(1); expect(saved.educationEvents[0]).toMatchObject({ kind: "admitted", ...input.education, after: { groupId: "113-mko" } });
    expect(JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!).studentNumberCounters).toEqual({ "2026:3": 1 });
  });
  it("shows another employee's first event and never writes a second admission", async () => {
    const input = editor(); await accountService.confirmAdmission(command(input));
    const raw = values.get(ACCOUNTS_STORAGE_KEY); const review = prepareAdmissionRefresh(input, source(), now);
    expect(review.firstEvent).toMatchObject({ kind: "admitted", effectiveDate: input.education.effectiveDate });
    expect(() => applyAdmissionRefresh(input, review, source())).toThrow("История обучения уже начата");
    const current = source(); const latest = current.accounts.find((entry) => entry.id === input.account.id)!;
    await expect(accountService.confirmAdmission({ ...command(input), expectedRevision: current.revision, accountRevision: latest.revision })).rejects.toThrow(review.restriction);
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(writes).toBe(1); expect(input.education.documentNumber).toBe("15-У");
  });
  it("rejects a changed comparison and preserves remote personal edits on a newly reviewed admission", async () => {
    const input = editor(); const review = prepareAdmissionRefresh(input, source(), now);
    await accountService.updateDetails({ ...editCommand(input), details: { name: "Актуальное имя", login: input.account.login, email: "remote@example.test" } });
    const raw = values.get(ACCOUNTS_STORAGE_KEY);
    expect(() => applyAdmissionRefresh(input, review, source())).toThrow("Обновите сравнение"); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw);
    const next = applyAdmissionRefresh(input, prepareAdmissionRefresh(input, source(), now), source());
    expect(writes).toBe(1); expect(next.education).toEqual(input.education);
    await accountService.confirmAdmission(command(next));
    expect(readAccountsState().accounts.find((entry) => entry.id === input.account.id)).toMatchObject({ name: "Актуальное имя", email: "remote@example.test", status: "blocked" });
    expect(writes).toBe(2); expect(readAccountsState().educationEvents).toHaveLength(1);
  });
});
