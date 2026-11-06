import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { createBackupConflictPreviewService, releaseBackupInspectionPreview, clearBackupConflictChoices } from "./localBackupConflictPreviewService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";
import type { BackupDependencies } from "./localBackupService";
import { plannerBackupFixture } from "../testSupport/localBackupDocuments";

const actor = { actorId: "configurator-demo", actorRevision: 1 };
const setup = async () => {
  const fixture = plannerBackupFixture(); const source = JSON.stringify(fixture.archive); const file = new File([source], "archive.json"); fixture.notes[0].text = "PRIVATE CURRENT"; fixture.save();
  const values = new Map(fixture.archive.localStorage.map(entry => [entry.key, entry.raw])); const authorize = vi.fn();
  const dependencies: BackupDependencies = { storage: { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null }, authorize, listDatabases: vi.fn(async () => []), readDatabase: vi.fn(), origin: fixture.archive.source.origin, basePath: fixture.archive.source.basePath };
  const inspections = createBackupInspectionService(dependencies); const inspection = await inspections.inspect({ ...actor, file }); const difference = inspection.plannerComparison!.differences[0];
  const service = createBackupConflictPreviewService(dependencies); const command = { ...actor, inspection, difference };
  return { fixture, file, values, authorize, inspections, inspection, difference, service, command };
};
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe("authorized snapshot-bound conflict preview", () => {
  it("requires an explicit review before an in-memory choice and writes no source data", async () => {
    const state = await setup(); const before = JSON.stringify([...state.values]);
    expect(() => state.service.choose({ ...state.command, version: "archive" })).toThrow("Сначала просмотрите");
    await state.service.preview(state.command);
    const choices = state.service.choose({ ...state.command, version: "archive" }); expect([...choices.values()]).toEqual(["archive"]);
    choices.set("forged-choice", "archive"); const next = state.service.choose({ ...state.command, version: "browser" }); expect([...next.values()]).toEqual(["browser"]);
    expect(JSON.stringify([...state.values])).toBe(before); expect(JSON.stringify(state.inspection)).not.toContain("choices");
    const report = prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize); expect(await report.blob.text()).not.toContain("PRIVATE");
  });
  it("invalidates choices on changed data, explicit reset and new inspections", async () => {
    const state = await setup(); await state.service.preview(state.command); state.service.choose({ ...state.command, version: "archive" });
    state.values.set("bi-university-theme", "dark"); expect(() => state.service.choose({ ...state.command, version: "browser" })).toThrow("проверьте файл заново"); state.values.delete("bi-university-theme");
    clearBackupConflictChoices(state.inspection); expect(() => state.service.choose({ ...state.command, version: "browser" })).toThrow("Сначала просмотрите");
    await state.service.preview(state.command); state.service.choose({ ...state.command, version: "browser" });
    await state.inspections.inspect({ ...actor, file: state.file }); expect(() => state.service.choose({ ...state.command, version: "archive" })).toThrow("проверьте файл заново");
  });
  it("does not allow choosing a version with unpreviewed extra fields", async () => {
    const state = await setup(); Object.assign(state.fixture.notes[0], { "PRIVATE FIELD": "PRIVATE VALUE" }); state.fixture.save();
    for (const entry of state.fixture.archive.localStorage) state.values.set(entry.key, entry.raw);
    const inspection = await state.inspections.inspect({ ...actor, file: state.file }); const command = { ...actor, inspection, difference: inspection.plannerComparison!.differences[0] };
    const preview = await state.service.preview(command); expect(preview.hasUnpreviewedFields).toBe(true);
    expect(() => state.service.choose({ ...command, version: "archive" })).toThrow("Сначала просмотрите");
  });
  it("shows values only on explicit preview and keeps the inspection report free of them", async () => {
    const state = await setup(); const before = JSON.stringify([...state.values]); const metadata = JSON.stringify(state.inspection);
    const preview = await state.service.preview(state.command);
    expect(preview.rows[0]).toMatchObject({ archive: '"PRIVATE NOTE TEXT"', browser: '"PRIVATE CURRENT"' });
    const report = prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize); expect(await report.blob.text()).not.toContain("PRIVATE");
    expect(JSON.stringify(state.inspection)).toBe(metadata); expect(JSON.stringify([...state.values])).toBe(before);
  });
  it("invalidates already-open values on later data changes, released binding or lost authority", async () => {
    const state = await setup(); await state.service.preview(state.command);
    expect(state.service.isCurrent(state.command)).toBe(true);
    state.values.set("bi-university-theme", "dark"); expect(state.service.isCurrent(state.command)).toBe(false);
    state.values.delete("bi-university-theme"); expect(state.service.isCurrent(state.command)).toBe(true);
    state.authorize.mockImplementation(() => { throw new Error("Доступ отозван"); }); expect(state.service.isCurrent(state.command)).toBe(false);
    state.authorize.mockReset(); releaseBackupInspectionPreview(state.inspection); expect(state.service.isCurrent(state.command)).toBe(false);
  });
  it("rejects changed local data before reading the archive again", async () => {
    const state = await setup(); const read = vi.spyOn(state.file, "arrayBuffer"); state.values.set("bi-university-theme", "dark");
    await expect(state.service.preview(state.command)).rejects.toThrow("проверьте файл заново"); expect(read).not.toHaveBeenCalled();
  });
  it("rejects a change during asynchronous archive reads without returning values", async () => {
    const state = await setup(); const read = state.file.arrayBuffer.bind(state.file);
    vi.spyOn(state.file, "arrayBuffer").mockImplementation(async () => { state.values.set("bi-university-theme", "dark"); return read(); });
    await expect(state.service.preview(state.command)).rejects.toThrow("проверьте файл заново");
  });
  it("rechecks authority during the operation", async () => {
    const state = await setup(); state.authorize.mockReset().mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.preview(state.command)).rejects.toThrow("Доступ отозван");
  });
  it.each(["actor", "revision", "copied-report", "forged-row", "released"])("rejects stale or forged inspection bindings: %s", async mode => {
    const state = await setup(); const command = { ...state.command };
    if (mode === "actor") command.actorId = "teacher-1";
    if (mode === "revision") command.actorRevision = 2;
    if (mode === "copied-report") command.inspection = structuredClone(command.inspection);
    if (mode === "forged-row") { command.difference = { ...command.difference, id: "another-record", reference: { storage: "localStorage-record", key: state.fixture.plannerKey, collection: "planner", id: "another-record" } }; command.inspection.plannerComparison!.differences.push(command.difference as typeof state.difference); }
    if (mode === "released") releaseBackupInspectionPreview(command.inspection);
    await expect(state.service.preview(command)).rejects.toThrow("проверьте файл заново");
  });
  it("verifies the exact file digest before parsing or revealing contents", async () => {
    const state = await setup(); vi.spyOn(state.file, "arrayBuffer").mockResolvedValue(new TextEncoder().encode('PRIVATE FILE REPLACED').buffer);
    await expect(state.service.preview(state.command)).rejects.toThrow("проверьте файл заново"); expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE");
  });
  it("invalidates the old binding when a new inspection starts even if that file is invalid", async () => {
    const state = await setup(); await expect(state.inspections.inspect({ ...actor, file: new File(["{}"], "another.json") })).rejects.toThrow();
    await expect(state.service.preview(state.command)).rejects.toThrow("проверьте файл заново");
  });
  it("honours cancellation after file I/O without logging contents or returning values", async () => {
    const state = await setup(); const controller = new AbortController(); const read = state.file.arrayBuffer.bind(state.file); vi.mocked(console.error).mockClear();
    vi.spyOn(state.file, "arrayBuffer").mockImplementation(async () => { controller.abort(); return read(); });
    await expect(state.service.preview({ ...state.command, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" }); expect(console.error).not.toHaveBeenCalled();
  });
  it("checks the binding again when it is released while the file is being read", async () => {
    const state = await setup(); const read = state.file.arrayBuffer.bind(state.file); vi.spyOn(state.file, "arrayBuffer").mockImplementation(async () => { releaseBackupInspectionPreview(state.inspection); return read(); });
    await expect(state.service.preview(state.command)).rejects.toThrow("проверьте файл заново");
  });
  it("does not bind a slower inspection after a newer one has completed", async () => {
    const state = await setup(); const bytes = await state.file.arrayBuffer(); let release: ((value: ArrayBuffer) => void) | undefined;
    const slow = new File([bytes], "slow.json"); vi.spyOn(slow, "arrayBuffer").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = state.inspections.inspect({ ...actor, file: slow });
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const current = await state.inspections.inspect({ ...actor, file: state.file }); release!(bytes); await assertion;
    await expect(state.service.preview({ ...actor, inspection: current, difference: current.plannerComparison!.differences[0] })).resolves.toHaveProperty("rows");
  });
});
