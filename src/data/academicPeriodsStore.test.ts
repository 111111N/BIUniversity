import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { academicPeriodsService, ACADEMIC_PERIODS_CHANGE_EVENT } from "./academicPeriodsStore";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, accountService } from "./accountStore";
import { ACADEMIC_PERIODS_STORAGE_KEY, type AcademicPeriodCommand } from "../domain/academicPeriods";
import { refreshAcademicCatalog } from "./academicCatalog";

let values: Map<string, string>, save: ReturnType<typeof vi.fn>;
const actorId = "configurator-demo";
const draft = { name: "2026–2027", startsOn: "2026-09-01", endsOn: "2027-08-31" };
const command = (): AcademicPeriodCommand => ({ type: "create-year", actorId, actorRevision: 1, expectedRevision: 0, draft: { ...draft } });
beforeEach(() => {
  values = new Map(); save = vi.fn((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: save }); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T09:00:00Z")); vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("shared university academic period service", () => {
  it("does not seed a calendar or rewrite existing documents on read", async () => {
    values.set("bi-university-assessments-v1", "existing statements");
    expect(await academicPeriodsService.read(actorId)).toEqual({ revision: 0, actorRevision: 1, years: [], terms: [] });
    expect(save).not.toHaveBeenCalled(); expect(values.get("bi-university-assessments-v1")).toBe("existing statements");
  });
  it("writes one calendar document and publishes a change after a successful save", async () => {
    const listener = vi.fn(), stop = academicPeriodsService.subscribe(listener);
    await academicPeriodsService.execute(command());
    const result = await academicPeriodsService.read(actorId);
    expect(result).toMatchObject({ revision: 1, years: [{ name: draft.name, revision: 1 }], terms: [] });
    expect(result).not.toHaveProperty("history"); expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0][0]).toBe(ACADEMIC_PERIODS_STORAGE_KEY); expect(listener).toHaveBeenCalledTimes(1); stop();
  });
  it("reads the same periods for different active accounts without exposing audit history", async () => {
    await academicPeriodsService.execute(command());
    expect((await academicPeriodsService.read("teacher-elena-volkova")).years).toEqual((await academicPeriodsService.read(actorId)).years);
    expect(await academicPeriodsService.read("anna-smirnova")).not.toHaveProperty("history");
  });
  it("captures queued input and rejects the losing concurrent write with no lost calendar", async () => {
    const first = command(), pending = academicPeriodsService.execute(first); first.draft.name = "Changed outside queue";
    const result = await Promise.allSettled([pending, academicPeriodsService.execute(command())]);
    expect(result.map(row => row.status)).toEqual(["fulfilled", "rejected"]);
    expect((await academicPeriodsService.read(actorId)).years[0].name).toBe(draft.name); expect(save).toHaveBeenCalledTimes(1);
  });
  it("serializes with account changes and rechecks the actor inside the write queue", async () => {
    const accounts = createInitialAccountsDocument(); accounts.accounts.push({ ...accounts.accounts[2], id: "second-configurator", login: "second.configurator" }); values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    const block = accountService.changeStatus({ actorId: "second-configurator", actorRevision: 1, expectedRevision: 0, accountId: actorId, accountRevision: 1, status: "blocked" });
    const result = await Promise.allSettled([block, academicPeriodsService.execute(command())]);
    expect(result.map(row => row.status)).toEqual(["fulfilled", "rejected"]); expect(values.has(ACADEMIC_PERIODS_STORAGE_KEY)).toBe(false);
  });
  it.each(["missing-actor", "teacher", "blocked", "revision", "damaged-accounts", "damaged-calendar"])("fails closed for %s", async mode => {
    const request = command(), accounts = createInitialAccountsDocument();
    if (mode === "missing-actor") request.actorId = "missing";
    if (mode === "teacher") request.actorId = "teacher-elena-volkova";
    if (mode === "blocked") accounts.accounts[2].status = "blocked";
    if (mode === "revision") accounts.accounts[2].revision++;
    values.set(ACCOUNTS_STORAGE_KEY, mode === "damaged-accounts" ? "damaged" : JSON.stringify(accounts));
    if (mode === "damaged-calendar") values.set(ACADEMIC_PERIODS_STORAGE_KEY, "damaged");
    const before = [...values.entries()]; await expect(academicPeriodsService.execute(request)).rejects.toThrow(); expect([...values.entries()]).toEqual(before); expect(save).not.toHaveBeenCalled();
  });
  it("does not emit a successful change or overwrite a calendar after a storage failure", async () => {
    const listener = vi.fn(), stop = academicPeriodsService.subscribe(listener); save.mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
    await expect(academicPeriodsService.execute(command())).rejects.toThrow("Quota exceeded"); expect(listener).not.toHaveBeenCalled(); expect(values.has(ACADEMIC_PERIODS_STORAGE_KEY)).toBe(false); stop();
  });
  it("edits a term with its own revision while keeping the old snapshots", async () => {
    await academicPeriodsService.execute(command()); const initial = await academicPeriodsService.read(actorId), yearId = initial.years[0].id;
    await academicPeriodsService.execute({ ...command(), expectedRevision: 1, type: "create-term", yearId, draft: { ...draft, name: "Осень" } });
    const term = (await academicPeriodsService.read(actorId)).terms[0];
    await academicPeriodsService.execute({ ...command(), expectedRevision: 2, type: "update-term", termId: term.id, entityRevision: 1, draft: { ...draft, name: "Осенний семестр" } });
    const read = await academicPeriodsService.read(actorId), history = await academicPeriodsService.history({ actorId, actorRevision: 1, expectedRevision: 3, entity: "term", entityId: term.id, page: 1 });
    expect(read.terms[0]).toMatchObject({ id: term.id, revision: 2, name: "Осенний семестр" }); expect(history.items.map(row => row.action)).toEqual(["updated", "created"]); expect(history.items[0].before?.name).toBe("Осень");
  });
  it("provides bounded, independent history pages and checks access on each request", async () => {
    await academicPeriodsService.execute(command()); const id = (await academicPeriodsService.read(actorId)).years[0].id;
    for (let index = 1; index <= 22; index++) await academicPeriodsService.execute({ ...command(), type: "update-year", yearId: id, entityRevision: index, expectedRevision: index, draft: { ...draft, name: `Год редакция ${index}` } });
    const base = { actorId, actorRevision: 1, expectedRevision: 23, entity: "year" as const, entityId: id, page: 1 }, saved = values.get(ACADEMIC_PERIODS_STORAGE_KEY);
    const first = await academicPeriodsService.history(base), second = await academicPeriodsService.history({ ...base, page: 2 });
    expect(first).toMatchObject({ total: 23, pages: 2 }); expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(3); first.items[0].after.name = "changed response";
    expect(values.get(ACADEMIC_PERIODS_STORAGE_KEY)).toBe(saved);
    for (const request of [{ ...base, actorId: "teacher-elena-volkova" }, { ...base, actorRevision: 2 }, { ...base, expectedRevision: 22 }, { ...base, entityId: "missing" }, { ...base, page: 0 }, { ...base, page: 3 }, { ...base, page: 1.5 }]) await expect(academicPeriodsService.history(request)).rejects.toThrow();
  });
  it("subscribes to periods, accounts and storage clearing and removes all listeners", () => {
    const listener = vi.fn(), stop = academicPeriodsService.subscribe(listener);
    const storage = (key: string | null) => { const event = new Event("storage"); Object.assign(event, { key }); window.dispatchEvent(event); };
    storage("unrelated"); expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new Event(ACADEMIC_PERIODS_CHANGE_EVENT)); window.dispatchEvent(new Event("bi-university-accounts-change")); storage(ACADEMIC_PERIODS_STORAGE_KEY); storage(ACCOUNTS_STORAGE_KEY); storage(null);
    expect(listener).toHaveBeenCalledTimes(5); stop(); window.dispatchEvent(new Event(ACADEMIC_PERIODS_CHANGE_EVENT)); storage(null); expect(listener).toHaveBeenCalledTimes(5);
  });
});
