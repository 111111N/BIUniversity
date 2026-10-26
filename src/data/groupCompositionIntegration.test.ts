import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY } from "./accountStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { groupCatalogService } from "./groupCatalogStore";
import { GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
import type { GroupCompositionQuery } from "../domain/groupComposition";

let values: Map<string, string>; let writes: number;
beforeEach(() => { values = new Map(); writes = 0; vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {}); vi.spyOn(console, "error").mockImplementation(() => undefined); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T10:00:00Z")); refreshAcademicCatalog(); });
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const query = (patch: Partial<GroupCompositionQuery> = {}): GroupCompositionQuery => ({ groupId: "112-mko", date: "2026-09-15", q: "", view: "studying", page: 1, ...patch });
const read = (patch: Partial<GroupCompositionQuery> = {}) => accountService.getGroupComposition({ ...actor, query: query(patch) });
const admission = () => accountService.confirmAdmission({ ...actor, expectedRevision: 0, accountId: "anna-smirnova", accountRevision: 1, expectedGroupRevision: 0, education: { effectiveDate: "2026-09-01", basis: "Приказ о зачислении" } });

describe("dated group composition adapter", () => {
  it("reads legacy uncertainty without seeding or writing storage", async () => {
    const result = await read({ view: "unknown" });
    expect(result).toMatchObject({ accountsRevision: 0, groupRevision: 0, total: 1, counts: { studying: 0, unknown: 1 }, groupNameAtDate: "112-МКо" });
    expect(writes).toBe(0); expect(values.size).toBe(0);
  });
  it("reads from the saved event ledger after transfer and changes no bytes or journal keys", async () => {
    await admission();
    await accountService.updateDetails({ ...actor, expectedRevision: 1, accountId: "anna-smirnova", accountRevision: 2, education: { effectiveDate: "2026-10-01", basis: "Приказ о переводе" }, details: { name: "Анна Смирнова", login: "anna.smirnova", memberships: [], studentGroupId: "113-mko" } });
    const before = JSON.stringify([...values]); const beforeWrites = writes;
    expect((await read()).rows[0].accountId).toBe("anna-smirnova");
    expect((await read({ date: "2026-10-01" })).total).toBe(0);
    expect((await read({ groupId: "113-mko", date: "2026-10-01" })).total).toBe(1);
    expect(writes).toBe(beforeWrites); expect(JSON.stringify([...values])).toBe(before);
  });
  it("returns the group name effective at the end of the selected Moscow day", async () => {
    await admission();
    await groupCatalogService.update({ ...actor, expectedRevision: 0, groupId: "112-mko", groupRevision: 0, draft: { name: "112-Новое", course: 1, campus: 3, admissionYear: 2026 } });
    expect((await read()).groupNameAtDate).toBe("112-МКо");
    expect((await read({ date: "2026-10-26" })).groupNameAtDate).toBe("112-Новое");
  });
  it("checks the actor, account revision and date on every read", async () => {
    await expect(accountService.getGroupComposition({ actorId: "anna-smirnova", actorRevision: 1, query: query() })).rejects.toThrow("настройщику");
    await expect(accountService.getGroupComposition({ ...actor, actorRevision: 2, query: query() })).rejects.toThrow("изменились");
    await expect(read({ date: "2026-10-27" })).rejects.toThrow("дату"); expect(writes).toBe(0);
  });
  it("refuses corrupt sources, preserving their original bytes", async () => {
    values.set(ACCOUNTS_STORAGE_KEY, "bad accounts"); await expect(read()).rejects.toThrow(); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe("bad accounts");
    values.delete(ACCOUNTS_STORAGE_KEY); values.set(GROUP_CATALOG_STORAGE_KEY, "bad groups"); await expect(read()).rejects.toThrow("каталог"); expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe("bad groups"); expect(writes).toBe(0);
  });
});
