import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { createBackupConflictPreviewService } from "./localBackupConflictPreviewService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";
import type { BackupDependencies } from "./localBackupService";
import { notificationBackupFixture } from "../testSupport/localBackupDocuments";

const actor = { actorId: "configurator-demo", actorRevision: 1 };
const setup = async () => {
  const fixture = notificationBackupFixture(), file = new File([JSON.stringify(fixture.archive)], "archive.json");
  fixture.notifications[0].body = "PRIVATE NEW NOTICE"; fixture.notifications[0].read = true; fixture.save();
  const values = new Map(fixture.archive.localStorage.map(entry => [entry.key, entry.raw])), authorize = vi.fn();
  const dependencies: BackupDependencies = { storage: { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null }, authorize, listDatabases: vi.fn(async () => []), readDatabase: vi.fn(), origin: fixture.archive.source.origin, basePath: fixture.archive.source.basePath };
  const inspections = createBackupInspectionService(dependencies), inspection = await inspections.inspect({ ...actor, file });
  const difference = inspection.notificationComparison!.differences[0], service = createBackupConflictPreviewService(dependencies);
  return { fixture, file, values, authorize, inspection, inspections, difference, service, command: { ...actor, inspection, difference } };
};
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe("snapshot-bound notification conflict previews", () => {
  it("binds per-record differences and allows an explicit draft only after reviewing both values", async () => {
    const state = await setup(), before = JSON.stringify([...state.values]), metadata = JSON.stringify(state.inspection);
    expect(state.inspection.notificationComparison!.counts).toMatchObject({ different: 1, comparedDocuments: 1 });
    expect(() => state.service.choose({ ...state.command, version: "archive" })).toThrow("Сначала просмотрите");
    const preview = await state.service.preview(state.command);
    expect(preview.rows).toContainEqual(expect.objectContaining({ field: "body", archive: '"PRIVATE NOTICE BODY"', browser: '"PRIVATE NEW NOTICE"' }));
    expect([...state.service.choose({ ...state.command, version: "browser" }).values()]).toEqual(["browser"]);
    expect(JSON.stringify([...state.values])).toBe(before); expect(JSON.stringify(state.inspection)).toBe(metadata);
    const report = await prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize).blob.text();
    expect(report).not.toContain("PRIVATE"); expect(report).not.toContain("/schedule?date"); expect(JSON.parse(report)).not.toHaveProperty("choices");
  });
  it("invalidates an open record and draft when the recipient catalog changes", async () => {
    const state = await setup(); await state.service.preview(state.command); state.service.choose({ ...state.command, version: "archive" });
    state.values.set("bi-university-accounts-v1", "{}");
    expect(state.service.isCurrent(state.command)).toBe(false); expect(() => state.service.choose({ ...state.command, version: "browser" })).toThrow("проверьте файл заново");
    await expect(state.service.preview(state.command)).rejects.toThrow("проверьте файл заново");
  });
  it("does not allow a choice when additional fields have not been fully previewed", async () => {
    const state = await setup(); Object.assign(state.fixture.notifications[0], { "PRIVATE EXTRA": "PRIVATE CONTENT" }); state.fixture.save();
    for (const entry of state.fixture.archive.localStorage) state.values.set(entry.key, entry.raw);
    const inspection = await state.inspections.inspect({ ...actor, file: state.file }), command = { ...actor, inspection, difference: inspection.notificationComparison!.differences[0] };
    expect(await state.service.preview(command)).toMatchObject({ hasUnpreviewedFields: true });
    expect(() => state.service.choose({ ...command, version: "archive" })).toThrow("Сначала просмотрите");
  });
});
