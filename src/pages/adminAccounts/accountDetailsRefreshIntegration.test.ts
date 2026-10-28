import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { accountDetailsDraftFrom, applyAccountDetailsRefresh, prepareAccountDetailsRefresh, type AccountDetailsEditor } from "./accountDetailsRefresh";

let values: Map<string, string>;
let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const source = () => ({ ...readAccountsState(), actorId: actor.actorId });
const editor = (): AccountDetailsEditor => {
  const snapshot = source(); const account = snapshot.accounts.find((entry) => entry.id === "anna-smirnova")!;
  return { ...actor, account, draft: { ...accountDetailsDraftFrom(account), name: "Мои изменения" }, baseline: JSON.stringify(accountDetailsDraftFrom(account)), revision: snapshot.revision };
};
const command = (input: AccountDetailsEditor) => ({ actorId: input.actorId, actorRevision: input.actorRevision, expectedRevision: input.revision, accountId: input.account.id, accountRevision: input.account.revision, details: { name: input.draft.name, login: input.draft.login, email: input.draft.email } });

describe("refresh personal details through existing account commands", () => {
  it("does not write on refresh/choice, then preserves unedited remote fields in the explicit save", async () => {
    const input = editor();
    await accountService.updateDetails({ ...command(input), details: { ...command(input).details, name: input.account.name, email: "remote@example.test" } });
    const raw = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(accountService.updateDetails(command(input))).rejects.toThrow("изменились");
    const review = prepareAccountDetailsRefresh(input, source()).review!;
    const next = applyAccountDetailsRefresh(input, review, source(), "mine");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw); expect(writes).toBe(1);
    expect(next.draft.email).toBe("remote@example.test");
    const saved = await accountService.updateDetails(command(next));
    expect(saved).toMatchObject({ id: input.account.id, name: "Мои изменения", email: "remote@example.test" });
    expect(writes).toBe(2);
    expect(readAccountsState().history.at(-1)?.changes).toEqual([{ field: "name", before: input.account.name, after: "Мои изменения" }]);
  });
  it("retains a remotely blocked account when keeping local personal details", async () => {
    const input = editor();
    await accountService.changeStatus({ ...actor, expectedRevision: 0, accountId: input.account.id, accountRevision: 1, status: "blocked" });
    const review = prepareAccountDetailsRefresh(input, source()).review!;
    const next = applyAccountDetailsRefresh(input, review, source(), "mine");
    expect(next.account.status).toBe("blocked"); expect(writes).toBe(1);
    const saved = await accountService.updateDetails(command(next));
    expect(saved.status).toBe("blocked"); expect(saved.name).toBe("Мои изменения");
  });
  it("rejects an outdated comparison and loads saved values without another write", async () => {
    const input = editor();
    await accountService.updateDetails({ ...command(input), details: { ...command(input).details, name: "Первое изменение" } });
    const review = prepareAccountDetailsRefresh(input, source()).review!;
    await accountService.updateDetails({ ...command(input), expectedRevision: 1, accountRevision: 2, details: { ...command(input).details, name: "Второе изменение" } });
    const raw = values.get(ACCOUNTS_STORAGE_KEY);
    expect(() => applyAccountDetailsRefresh(input, review, source(), "mine")).toThrow("Обновите сравнение");
    expect(input.draft.name).toBe("Мои изменения"); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(raw);
    const fresh = prepareAccountDetailsRefresh(input, source()).review!;
    const loaded = applyAccountDetailsRefresh(input, fresh, source(), "saved");
    expect(loaded.draft.name).toBe("Второе изменение"); expect(JSON.stringify(loaded.draft)).toBe(loaded.baseline); expect(writes).toBe(2);
  });
});
