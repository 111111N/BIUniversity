import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { createBackupConflictPreviewService } from "./localBackupConflictPreviewService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";
import type { BackupDependencies } from "./localBackupService";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import { assessBackupRestoreAdmission } from "../domain/backupRestoreAdmission";

const actor = { actorId: "configurator-demo", actorRevision: 1 };
const setup = async (key = "bi-university-theme", archive = "dark", browser = "light") => {
  const fixture = coreBackupFixture(); fixture.archive.localStorage.push({ key, raw: archive }); fixture.archive.totals.storageEntries++;
  const file = new File([JSON.stringify(fixture.archive)], "archive.json");
  const values = new Map(fixture.archive.localStorage.map(entry => [entry.key, entry.raw])); values.set(key, browser);
  const authorize = vi.fn();
  const dependencies: BackupDependencies = { storage: { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null }, authorize, listDatabases: vi.fn(async () => []), readDatabase: vi.fn(), origin: fixture.archive.source.origin, basePath: fixture.archive.source.basePath };
  const inspections = createBackupInspectionService(dependencies), inspection = await inspections.inspect({ ...actor, file });
  const difference = inspection.comparison.differences.find(item => item.id === key)!;
  const service = createBackupConflictPreviewService(dependencies), command = { ...actor, inspection, difference };
  return { fixture, file, values, authorize, inspection, inspections, difference, service, command };
};
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe("snapshot-bound preference preview and draft choices", () => {
  it.each([["bi-university-theme", "dark", "light"], ["bi-university-planner-view", "board", "list"], ["bi-university-schedule-view:student:student-1", "grid", "list"]])("binds an inspected scalar conflict and stores only an explicit in-memory choice: %s", async (key, a, b) => {
    const state = await setup(key, a, b), before = JSON.stringify([...state.values]), metadata = JSON.stringify(state.inspection);
    expect(() => state.service.choose({ ...state.command, version: "archive" })).toThrow("Сначала просмотрите");
    const preview = await state.service.preview(state.command); expect(preview.rows).toHaveLength(1);
    const choices = state.service.choose({ ...state.command, version: "browser" }); expect([...choices.values()]).toEqual(["browser"]);
    expect(JSON.stringify([...state.values])).toBe(before); expect(JSON.stringify(state.inspection)).toBe(metadata);
    const report = JSON.parse(await prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize).blob.text());
    expect(report).not.toHaveProperty("choices"); expect(JSON.stringify(report)).not.toContain(preview.rows[0].archive);
    expect(assessBackupRestoreAdmission(state.inspection.documents).status).not.toBe("ready");
  });
  it("keeps a damaged preference blocking the archive and prevents a choice", async () => {
    const state = await setup("bi-university-theme", "PRIVATE INVALID", "light");
    expect(assessBackupRestoreAdmission(state.inspection.documents).status).toBe("blocked");
    await expect(state.service.preview(state.command)).rejects.toThrow("не входит в поддерживаемый набор");
    expect(() => state.service.choose({ ...state.command, version: "archive" })).toThrow("Сначала просмотрите");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE INVALID");
  });
  it("invalidates the draft when the preference or owner document changes", async () => {
    const state = await setup("bi-university-schedule-view:student:student-1", "grid", "list"); await state.service.preview(state.command);
    state.service.choose({ ...state.command, version: "archive" }); state.values.set("bi-university-accounts-v1", "{}");
    expect(state.service.isCurrent(state.command)).toBe(false); expect(() => state.service.choose({ ...state.command, version: "browser" })).toThrow("проверьте файл заново");
  });
  it("rejects forged scalar identities even after reviewing the genuine key", async () => {
    const state = await setup(); await state.service.preview(state.command);
    expect(() => state.service.choose({ ...state.command, difference: { ...state.difference, id: "forged" }, version: "archive" })).toThrow("проверьте файл заново");
  });
  it("does not grant newly inserted report rows access to the private snapshot", async () => {
    const state = await setup(); const difference = { kind: "different" as const, area: "Настройки", id: "bi-university-planner-view", reference: { storage: "localStorage" as const, key: "bi-university-planner-view" } };
    state.inspection.comparison.differences.push(difference);
    await expect(state.service.preview({ ...state.command, difference })).rejects.toThrow("проверьте файл заново");
  });
});
