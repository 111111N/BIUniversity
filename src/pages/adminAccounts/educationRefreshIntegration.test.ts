import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { accountDetailsDraftFrom } from "./accountDetailsRefresh";
import { getEducationOperationProblem, prepareEducationOperation } from "./educationOperationModel";
import { applyEducationRefresh, prepareEducationRefresh, type EducationRefreshEditor } from "./educationRefresh";

let values: Map<string, string>; let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const now = "2026-10-28T10:00:00Z";
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now)); refreshAcademicCatalog();
  const state = createInitialAccountsDocument(); state.accounts[1].status = "blocked"; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const source = () => { const groups = readGroupCatalogState(); return { ...readAccountsState(), actorId: actor.actorId, groups: groups.groups, groupRevision: groups.revision, groupError: groups.error }; };
const editor = (): EducationRefreshEditor => {
  const state = source(); const account = state.accounts.find((entry) => entry.id === "anna-smirnova")!; const base = accountDetailsDraftFrom(account);
  return { ...actor, account, draft: prepareEducationOperation(account, base, "graduate"), baseline: JSON.stringify(base), educationOperation: "graduate", education: { effectiveDate: "2026-10-24", basis: "Мой приказ", documentNumber: "15-У" }, educationBaseline: { effectiveDate: "2026-10-28", basis: "" }, revision: state.revision, educationGroupRevision: state.groupRevision };
};
const command = (input: EducationRefreshEditor) => ({ ...actor, actorRevision: input.actorRevision, expectedRevision: input.revision, accountId: input.account.id, accountRevision: input.account.revision, details: { name: input.draft.name, login: input.draft.login, email: input.draft.email, memberships: input.draft.memberships, studentGroupId: input.draft.studentGroupId, enrollmentStatus: input.draft.enrollmentStatus }, education: input.education });

describe("education refresh with existing account and event commands", () => {
  it("preserves input through another transfer, then requires a valid date and separate save", async () => {
    const input = editor();
    await accountService.updateDetails({ ...command(input), details: { ...command(input).details, enrollmentStatus: "studying", studentGroupId: "113-mko", memberships: [] }, education: { effectiveDate: "2026-10-26", basis: "Другой перевод" } });
    const raw = values.get(ACCOUNTS_STORAGE_KEY);
    const review = prepareEducationRefresh(input, source(), now);
    expect(review.problem).toContain("раньше последнего события");
    const next = applyEducationRefresh(input, review, source());
    expect(next.education).toEqual(input.education); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(writes).toBe(1);
    await expect(accountService.updateDetails(command(next))).rejects.toThrow("раньше последнего события"); expect(writes).toBe(1);
    next.education.effectiveDate = "2026-10-27";
    const fresh = source();
    expect(getEducationOperationProblem(next.account, next.draft, next.educationOperation, next.education, fresh.educationEvents.filter((event) => event.accountId === next.account.id), fresh.groups, now)).toBe("");
    const saved = await accountService.updateDetails(command(next));
    expect(saved).toMatchObject({ studentGroupId: "113-mko", enrollmentStatus: "graduated", status: "blocked" });
    expect(writes).toBe(2); expect(readAccountsState().educationEvents.at(-1)).toMatchObject({ kind: "graduated", effectiveDate: "2026-10-27", basis: "Мой приказ", documentNumber: "15-У" });
  });
  it("rejects a changed comparison and keeps remote personal fields on a subsequent event", async () => {
    const input = editor(); const review = prepareEducationRefresh(input, source(), now);
    await accountService.updateDetails({ ...command(input), education: undefined, details: { name: "Новое имя", login: input.account.login, email: "remote@example.test" } });
    const raw = values.get(ACCOUNTS_STORAGE_KEY);
    expect(() => applyEducationRefresh(input, review, source())).toThrow("Обновите сравнение");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(input.education.basis).toBe("Мой приказ");
    const fresh = prepareEducationRefresh(input, source(), now); const next = applyEducationRefresh(input, fresh, source());
    const saved = await accountService.updateDetails(command(next));
    expect(saved).toMatchObject({ name: "Новое имя", email: "remote@example.test", enrollmentStatus: "graduated", status: "blocked" }); expect(writes).toBe(2);
  });
});
