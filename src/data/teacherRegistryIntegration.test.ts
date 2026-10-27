import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { refreshAcademicCatalog, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import type { TeacherRegistryQuery } from "../domain/teacherRegistry";

let values: Map<string, string>;
const query: TeacherRegistryQuery = { q: "", subject: "all", group: "all", assignments: "all", access: "all", page: 1 };
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const read = () => accountService.listTeachers({ ...actor, query });
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn(() => { throw new Error("Read must not write"); }) });
  vi.stubGlobal("window", new EventTarget());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("teacher registry adapter", () => {
  it("returns a page without seeding or writing storage", async () => {
    expect(await read()).toMatchObject({ total: 1, totalTeachers: 1, withoutAssignments: 0 });
    expect(values.size).toBe(0);
  });
  it("rejects academic roles and an outdated or blocked configurator", async () => {
    await expect(accountService.listTeachers({ actorId: "anna-smirnova", actorRevision: 1, query })).rejects.toThrow("настройщику");
    await expect(accountService.listTeachers({ ...actor, actorRevision: 99, query })).rejects.toThrow("изменились");
    const state = createInitialAccountsDocument(); state.accounts.find((account) => account.id === actor.actorId)!.status = "blocked";
    state.accounts.push({ id: "other-configurator", role: "configurator", name: "Другой настройщик", login: "other.configurator", revision: 1, memberships: [] });
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    await expect(read()).rejects.toThrow("настройщику");
  });
  it("rejects corrupt accounts and catalogs without replacing their bytes", async () => {
    values.set(ACCOUNTS_STORAGE_KEY, "broken");
    await expect(read()).rejects.toThrow();
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe("broken");
    values.delete(ACCOUNTS_STORAGE_KEY); values.set(SUBJECT_CATALOG_STORAGE_KEY, "broken catalog");
    await expect(read()).rejects.toThrow("каталог недоступен");
    expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe("broken catalog");
  });
  it("reflects role and assignment changes on the next read", async () => {
    const state = createInitialAccountsDocument();
    const teacher = state.accounts[0]; teacher.memberships = [];
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    expect(await read()).toMatchObject({ totalTeachers: 1, withoutAssignments: 1 });
    teacher.role = "configurator";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    expect(await read()).toMatchObject({ totalTeachers: 0, withoutAssignments: 0 });
  });
});
