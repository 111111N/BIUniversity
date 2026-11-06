import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as groupDomain from "./groupCatalog";
import * as subjectDomain from "./subjectCatalog";
import { assertCompleteCatalogComparison, compareBackupCatalogRecords, getUncheckedCatalogDocuments } from "./backupCatalogComparison";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";

const setup = () => {
  const state = coreBackupFixture();
  state.groups.history = [{ id: "event-1", groupId: "group-1", actorId: "configurator-demo", occurredAt: "2026-10-28T09:00:00Z", action: "created" }];
  state.subjects.history = [{ id: "event-1", subjectId: "subject-1", actorId: "configurator-demo", occurredAt: "2026-10-28T09:00:00Z", action: "created" }];
  state.save(); return state;
};
const forbidden = vi.fn(() => { throw new Error("Catalog comparison must not use live storage"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("catalog histories by event ID", () => {
  it("isolates equal event IDs across catalog types and card collections", async () => {
    const state = setup(); const original = structuredClone(state.archive.localStorage);
    state.groups.history[0].actorId = "PRIVATE ACTOR"; state.save();
    const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    expect(result.groups.counts.same).toBe(1); expect(result.subjects.counts.same).toBe(1);
    expect(result.subjectHistory?.counts.same).toBe(1); expect(result.groupHistory?.differences[0]).toMatchObject({ id: "event-1", fields: ["actorId"], reference: { collection: "group-history", key: "bi-university-group-catalog-v1", id: "event-1" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(() => assertCompleteCatalogComparison(result)).not.toThrow();
  });
  it("reports all group-history fields without exporting snapshots", async () => {
    const state = setup(); state.groups.groups.push({ ...state.groups.groups[0], id: "group-2", name: "102-ИВТ" }); state.save(); const original = structuredClone(state.archive.localStorage);
    Object.assign(state.groups.history[0], { groupId: "group-2", actorId: "PRIVATE AUTHOR", occurredAt: "2026-10-29T09:00:00Z", action: "updated", before: { name: "PRIVATE OLD", course: 1, status: "active" }, after: { name: "PRIVATE NEW", course: 2, status: "active" } }); state.save();
    const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    expect(result.groupHistory?.differences[0].fields).toEqual(["groupId", "actorId", "occurredAt", "action", "before", "after"]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("compares subject target, author and timestamp while retaining the supported action", async () => {
    const state = setup(); state.subjects.subjects.push({ ...state.subjects.subjects[0], id: "subject-2", name: "Физика", shortName: "ФИЗ" }); state.save(); const original = structuredClone(state.archive.localStorage);
    Object.assign(state.subjects.history[0], { subjectId: "subject-2", actorId: "PRIVATE AUTHOR", occurredAt: "2026-10-29T09:00:00Z" }); state.save();
    const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    expect(result.subjectHistory?.differences[0].fields).toEqual(["subjectId", "actorId", "occurredAt"]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("ignores property and event order without consulting current catalog names", async () => {
    const state = setup(); state.groups.history.push({ ...state.groups.history[0], id: "event-2" }); state.save(); const original = structuredClone(state.archive.localStorage);
    state.groups.history.reverse(); state.subjects.history = state.subjects.history.map(row => Object.fromEntries(Object.entries(row).reverse()) as typeof row); state.save();
    const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    expect(result.groupHistory?.counts.same).toBe(2); expect(result.subjectHistory?.counts.same).toBe(1);
  });
  it.each(["groups", "subjects"] as const)("rejects duplicate or dangling %s history using the full source schema", async (kind) => {
    const state = setup(); const original = structuredClone(state.archive.localStorage);
    if (kind === "groups") state.groups.history.push({ ...state.groups.history[0] }); else state.subjects.history[0].subjectId = "missing-subject";
    state.save(); const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    const section = kind === "groups" ? result.groupHistory : result.subjectHistory;
    expect(section?.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0, new: 0, currentOnly: 0 }); expect(section?.differences).toEqual([]);
    expect(result[kind].counts.uncheckedDocuments).toBe(1); expect(getUncheckedCatalogDocuments(result)).toBe(1);
  });
  it("preserves unknown field differences but not unknown names or values", async () => {
    const state = setup(); const original = structuredClone(state.archive.localStorage); Object.assign(state.subjects.history[0], { "PRIVATE FIELD": "PRIVATE VALUE" }); state.save();
    const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    expect(result.subjectHistory?.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("does not match a replacement event by identical content or target", async () => {
    const state = setup(); const original = structuredClone(state.archive.localStorage); state.groups.history[0].id = "another-event"; state.save();
    const result = await compareBackupCatalogRecords(original, state.archive.localStorage);
    expect(result.groupHistory?.counts).toMatchObject({ same: 0, different: 0, new: 1, currentOnly: 1 });
  });
  it("retains all 230 events and rejects truncated or wrongly addressed results", async () => {
    const state = setup(); state.groups.history = Array.from({ length: 230 }, (_, i) => ({ ...state.groups.history[0], id: `event-${String(i).padStart(3, "0")}` })); state.save();
    const result = await compareBackupCatalogRecords(state.archive.localStorage, []);
    expect(result.groupHistory?.differences).toHaveLength(230); expect(result.groupHistory?.differences.at(-1)?.id).toBe("event-229"); expect(() => assertCompleteCatalogComparison(result)).not.toThrow();
    const wrong = structuredClone(result); Object.assign(wrong.groupHistory!.differences[0].reference!, { collection: "subject-history" }); expect(() => assertCompleteCatalogComparison(wrong)).toThrow("неполный отчёт");
    result.groupHistory!.differences.pop(); expect(() => assertCompleteCatalogComparison(result)).toThrow("неполный отчёт");
  });
  it.each(["missing-groups", "missing-subjects", "unknown-version", "missing-version"])("rejects incomplete versioned catalog histories: %s", async (mode) => {
    const state = setup(); const result = await compareBackupCatalogRecords(state.archive.localStorage, []);
    if (mode === "missing-groups") delete result.groupHistory;
    if (mode === "missing-subjects") delete result.subjectHistory;
    if (mode === "unknown-version") Object.assign(result, { historyComparisonVersion: 2 });
    if (mode === "missing-version") delete result.historyComparisonVersion;
    expect(() => assertCompleteCatalogComparison(result)).toThrow("неполный отчёт");
  });
  it("accepts legacy results without any history extensions", async () => {
    const state = setup(); const result = await compareBackupCatalogRecords(state.archive.localStorage, []);
    delete result.historyComparisonVersion; delete result.groupHistory; delete result.subjectHistory;
    expect(() => assertCompleteCatalogComparison(result)).not.toThrow();
  });
  it("reuses each source decode for cards and events only within one comparison", async () => {
    const state = setup(); const groups = vi.spyOn(groupDomain, "decodeGroupCatalog"), subjects = vi.spyOn(subjectDomain, "decodeSubjectCatalog");
    await compareBackupCatalogRecords(state.archive.localStorage, state.archive.localStorage);
    expect(groups).toHaveBeenCalledTimes(1); expect(subjects).toHaveBeenCalledTimes(1);
    await compareBackupCatalogRecords(state.archive.localStorage, state.archive.localStorage);
    expect(groups).toHaveBeenCalledTimes(2); expect(subjects).toHaveBeenCalledTimes(2);
  });
  it("honours cancellation during a long history", async () => {
    const state = setup(); state.groups.history = Array.from({ length: 300 }, (_, i) => ({ ...state.groups.history[0], id: `event-${i}` })); state.save();
    const controller = new AbortController(); setTimeout(() => controller.abort(), 0);
    await expect(compareBackupCatalogRecords(state.archive.localStorage, [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
