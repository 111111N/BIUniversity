import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { administrationChecksService } from "./administrationChecksService";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { refreshAcademicCatalog, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import { GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
import { MANAGED_SCHEDULE_KEY } from "../domain/scheduleManagement";

let values: Map<string, string>;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const query = { q: "", kind: "all", level: "all", page: 1 };
const read = () => administrationChecksService.list({ ...actor, query });
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn(() => { throw new Error("Checks must not write"); }) });
  vi.stubGlobal("window", undefined); vi.stubGlobal("navigator", undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T10:00:00Z")); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("administrative checks service", () => {
  it("returns source versions and check time without seeding or writing", async () => {
    const result = await read();
    expect(result).toMatchObject({ checkedAt: "2026-10-27T10:00:00.000Z", versions: { accounts: 0, schedule: 0, subjects: 0, groups: 0 } });
    expect(result.rows.length).toBeLessThanOrEqual(20); expect(result.kinds["student-number"]).toBe(1);
    expect(values.size).toBe(0);
  });
  it("checks actor role, active access and actor revision", async () => {
    await expect(administrationChecksService.list({ actorId: "anna-smirnova", actorRevision: 1, query })).rejects.toThrow("настройщику");
    await expect(administrationChecksService.list({ ...actor, actorRevision: 99, query })).rejects.toThrow("изменились");
    const state = createInitialAccountsDocument(); state.accounts[2].status = "blocked";
    state.accounts.push({ ...state.accounts[2], id: "other-configurator", login: "other.configurator", status: "active" });
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    await expect(read()).rejects.toThrow("настройщику");
  });
  it("fails closed for each damaged source and preserves original bytes", async () => {
    for (const key of [ACCOUNTS_STORAGE_KEY, SUBJECT_CATALOG_STORAGE_KEY, GROUP_CATALOG_STORAGE_KEY, MANAGED_SCHEDULE_KEY]) {
      values.clear(); values.set(key, `damaged:${key}`);
      await expect(read()).rejects.toThrow();
      expect([...values]).toEqual([[key, `damaged:${key}`]]);
    }
  });
  it("reflects a correction on the next request without changing other records", async () => {
    const before = await read();
    const state = createInitialAccountsDocument(); state.accounts[0].memberships = []; state.revision = 1;
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    const bytes = values.get(ACCOUNTS_STORAGE_KEY);
    const after = await read();
    expect(after.kinds["unassigned-subject"]).toBeGreaterThan(before.kinds["unassigned-subject"]);
    expect(after.versions.accounts).toBe(1); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(bytes);
  });
});
