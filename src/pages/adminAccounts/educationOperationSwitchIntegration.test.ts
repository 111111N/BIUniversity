import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { getStudentGroupId } from "../../domain/accounts";
import { accountDetailsDraftFrom } from "./accountDetailsRefresh";
import { prepareEducationOperation } from "./educationOperationModel";
import type { EducationRefreshEditor } from "./educationRefresh";
import { applyEducationSwitch, prepareEducationSwitch } from "./educationOperationSwitch";

let values: Map<string, string>; let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z")); refreshAcademicCatalog();
  const state = createInitialAccountsDocument(); state.accounts[1].status = "blocked";
  state.accounts[1].studentRecord = { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: "2026-09-01T10:00:00Z" };
  state.studentNumberCounters = { "2026:3": 1 }; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const source = () => { const groups = readGroupCatalogState(); return { ...readAccountsState(), actorId: actor.actorId, groups: groups.groups, groupRevision: groups.revision, groupError: groups.error }; };
const editor = (): EducationRefreshEditor => {
  const state = source(); const account = state.accounts.find((entry) => entry.id === "anna-smirnova")!; const base = accountDetailsDraftFrom(account);
  return { ...actor, account, draft: prepareEducationOperation(account, base, "graduate"), baseline: JSON.stringify(base), educationOperation: "graduate", education: { effectiveDate: "2026-10-24", basis: "Приказ ректора", documentNumber: "15-У", documentDate: "2026-10-23" }, educationBaseline: { effectiveDate: "2026-10-28", basis: "" }, revision: state.revision, educationGroupRevision: state.groupRevision };
};
const command = (input: EducationRefreshEditor) => ({ ...actor, actorRevision: input.actorRevision, expectedRevision: input.revision, accountId: input.account.id, accountRevision: input.account.revision, details: { name: input.draft.name, login: input.draft.login, email: input.draft.email, memberships: input.draft.memberships, studentGroupId: input.draft.studentGroupId, enrollmentStatus: input.draft.enrollmentStatus }, education: input.education });

describe("education switching with the existing persistence command", () => {
  it("writes only the chosen event after a separate save and retains its document and blocked access", async () => {
    const input = editor(); const raw = values.get(ACCOUNTS_STORAGE_KEY);
    const review = prepareEducationSwitch(input, "withdraw", source());
    const next = applyEducationSwitch(input, review, source());
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(writes).toBe(0); expect(readAccountsState().educationEvents).toEqual([]);
    const saved = await accountService.updateDetails(command(next));
    expect(saved).toMatchObject({ enrollmentStatus: "withdrawn", studentGroupId: getStudentGroupId(input.account), status: "blocked" });
    expect(saved.studentRecord).toEqual(input.account.studentRecord);
    expect(writes).toBe(1); expect(readAccountsState().educationEvents).toHaveLength(1);
    expect(readAccountsState().educationEvents[0]).toMatchObject({ kind: "withdrawn", ...input.education });
  });
  it("discards a transfer destination without moving the student or creating a transfer event", async () => {
    const input = editor(); input.educationOperation = "transfer"; input.draft = { ...accountDetailsDraftFrom(input.account), studentGroupId: "113-mko", memberships: [] };
    const review = prepareEducationSwitch(input, "graduate", source());
    expect(review.discardedGroup).toBe("113-МКо"); expect(input.draft.studentGroupId).toBe("113-mko"); expect(writes).toBe(0);
    const next = applyEducationSwitch(input, review, source());
    expect(writes).toBe(0); expect(next.education).toEqual(input.education);
    const saved = await accountService.updateDetails(command(next));
    expect(saved.studentGroupId).toBe(getStudentGroupId(input.account)); expect(saved.studentRecord).toEqual(input.account.studentRecord);
    expect(JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!).studentNumberCounters).toEqual({ "2026:3": 1 });
    expect(readAccountsState().educationEvents.map((event) => event.kind)).toEqual(["graduated"]); expect(writes).toBe(1);
  });
  it("rejects a pending choice after another employee saves, keeping the document and remote change", async () => {
    const input = editor(); const review = prepareEducationSwitch(input, "withdraw", source());
    await accountService.updateDetails({ ...command(input), education: undefined, details: { name: "Обновлённое имя", login: input.account.login, email: "remote@example.test" } });
    const raw = values.get(ACCOUNTS_STORAGE_KEY);
    expect(() => applyEducationSwitch(input, review, source())).toThrow("Обновите проверку");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(writes).toBe(1); expect(input.education.documentNumber).toBe("15-У");
    expect(readAccountsState().educationEvents).toEqual([]);
  });
});
