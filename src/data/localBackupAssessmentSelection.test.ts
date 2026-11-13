import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentCorrectionFixture } from "../testSupport/assessmentCorrections";
import { ASSESSMENTS_STORAGE_KEY } from "../domain/assessmentTypes";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { clearBackupConflictChoices, createBackupConflictPreviewService, releaseBackupInspectionPreview } from "./localBackupConflictPreviewService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";
import type { BackupDependencies } from "./localBackupService";
import type { AdministrativeBackup } from "../domain/localBackup";

const actor = { actorId: "configurator-demo", actorRevision: 1 };
const setup = async (edit?: (archive: AdministrativeBackup, browser: Map<string, string>) => void) => {
  const fixture = assessmentCorrectionFixture(), opened = fixture.open();
  const a = fixture.publish(fixture.save(opened, { status: "graded", grade: 2 })), b = fixture.publish(fixture.save(opened, { status: "graded", grade: 4 }));
  const archive = fixture.source.save(a);
  const values = new Map(archive.localStorage.map(entry => [entry.key, entry.raw])); values.set(ASSESSMENTS_STORAGE_KEY, JSON.stringify(b));
  edit?.(archive, values);
  const file = new File([JSON.stringify(archive)], "assessments.json");
  const authorize = vi.fn();
  const dependencies: BackupDependencies = { storage: { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null }, authorize, listDatabases: vi.fn(async () => []), readDatabase: vi.fn(), origin: archive.source.origin, basePath: archive.source.basePath };
  const inspection = await createBackupInspectionService(dependencies).inspect({ ...actor, file });
  const service = createBackupConflictPreviewService(dependencies), command = { ...actor, inspection };
  const review = inspection.assessmentComparison!;
  const differences = [...review.assessments.differences, ...review.history.differences, ...review.corrections!.differences, ...review.correctionHistory!.differences].filter(row => row.kind === "different");
  const choose = async (version: "archive" | "browser") => {
    for (const difference of differences) { await service.preview({ ...command, difference }); service.choose({ ...command, difference, version }); }
  };
  return { fixture, file, values, authorize, inspection, service, command, differences, choose };
};
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

describe("authorized assessment selection review", () => {
  it("does not certify a referenced account conflict until its card has been reviewed and selected", async () => {
    const state = await setup((_archive, browser) => {
      const value = JSON.parse(browser.get("bi-university-accounts-v1")!); value.accounts.find((row: { id: string }) => row.id === "teacher-1").name = "PRIVATE REFERENCE NAME";
      browser.set("bi-university-accounts-v1", JSON.stringify(value));
    });
    await state.choose("browser");
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "blocked", references: { status: "blocked", counts: { unresolved: 1 }, issues: [{ referenceId: "teacher-1" }] } });
    const difference = state.inspection.accountComparison!.differences.find(row => row.id === "teacher-1")!;
    expect(() => state.service.choose({ ...state.command, difference, version: "archive" })).toThrow("Сначала просмотрите");
    await state.service.preview({ ...state.command, difference }); state.service.choose({ ...state.command, difference, version: "archive" });
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "consistent", references: { status: "references-present", counts: { found: 5 } } });
  });
  it("blocks a missing participant from both sources and reports only the exact ID", async () => {
    const state = await setup((archive, browser) => {
      const entry = archive.localStorage.find(row => row.key === "bi-university-accounts-v1")!, value = JSON.parse(entry.raw);
      value.accounts = value.accounts.filter((row: { id: string }) => row.id !== "student-1"); entry.raw = JSON.stringify(value); browser.set(entry.key, entry.raw);
    });
    await state.choose("browser"); const result = await state.service.reviewAssessments(state.command);
    expect(result).toMatchObject({ status: "blocked", references: { counts: { missing: 1 }, issues: [{ code: "missing-reference", referenceId: "student-1" }] } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Смирнова|graded/);
  });
  it("preserves a browser-only participant without granting historical authority", async () => {
    const state = await setup(archive => {
      const entry = archive.localStorage.find(row => row.key === "bi-university-accounts-v1")!, value = JSON.parse(entry.raw);
      value.accounts = value.accounts.filter((row: { id: string }) => row.id !== "student-1"); entry.raw = JSON.stringify(value);
    });
    await state.choose("browser");
    const result = await state.service.reviewAssessments(state.command);
    expect(result).toMatchObject({ status: "consistent", references: { scope: "assessment-reference-presence", status: "references-present" } });
    expect(JSON.stringify(result)).not.toContain("authorized");
  });
  it("does not accept an unpreviewed extra field as a reviewed reference card", async () => {
    const state = await setup((_archive, browser) => {
      const value = JSON.parse(browser.get("bi-university-accounts-v1")!); value.accounts.find((row: { id: string }) => row.id === "teacher-1").unknownField = "PRIVATE UNKNOWN FIELD";
      browser.set("bi-university-accounts-v1", JSON.stringify(value));
    });
    await state.choose("browser");
    const difference = state.inspection.accountComparison!.differences.find(row => row.id === "teacher-1")!;
    expect(await state.service.preview({ ...state.command, difference })).toMatchObject({ hasUnpreviewedFields: true });
    expect(() => state.service.choose({ ...state.command, difference, version: "browser" })).toThrow("Сначала просмотрите");
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "blocked", references: { counts: { unresolved: 1 } } });
  });
  it.each([
    { key: "bi-university-group-catalog-v1", collection: "groups" as const, id: "group-1" },
    { key: "bi-university-subject-catalog-v1", collection: "subjects" as const, id: "subject-1" },
  ])("uses reviewed choices for a referenced $collection card", async ({ key, collection, id }) => {
    const state = await setup((_archive, browser) => {
      const value = JSON.parse(browser.get(key)!); value[collection][0].name = "PRIVATE SELECTED NAME"; browser.set(key, JSON.stringify(value));
    });
    await state.choose("browser");
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "blocked", references: { issues: [{ code: "unresolved-reference", target: collection, referenceId: id }] } });
    const difference = state.inspection.catalogComparison![collection].differences.find(row => row.id === id)!;
    await state.service.preview({ ...state.command, difference }); state.service.choose({ ...state.command, difference, version: "browser" });
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "consistent", references: { status: "references-present" } });
  });
  it("does not choose unresolved conflicts automatically", async () => {
    const state = await setup();
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "blocked", counts: { conflicts: 3, unresolved: 3 }, issues: [{ code: "unresolved-conflicts" }] });
  });
  it("uses only reviewed choices, leaves all data and the report unchanged and returns no student values", async () => {
    const state = await setup(), before = JSON.stringify([...state.values]), original = JSON.stringify(state.inspection);
    await state.choose("browser");
    const result = await state.service.reviewAssessments(state.command);
    expect(result).toMatchObject({ status: "consistent", revisions: { candidate: 6 } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|student-1|teacher-1|graded/);
    expect(JSON.stringify([...state.values])).toBe(before); expect(JSON.stringify(state.inspection)).toBe(original);
    const report = prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize);
    expect(await report.blob.text()).not.toMatch(/PRIVATE|candidate|consistent/);
  });
  it("blocks a correction selected from the browser with incompatible archive audit events", async () => {
    const state = await setup(); await state.choose("archive");
    const difference = state.differences.find(row => row.reference?.storage === "localStorage-record" && row.reference.collection === "assessment-corrections")!;
    state.service.choose({ ...state.command, difference, version: "browser" });
    expect(await state.service.reviewAssessments(state.command)).toMatchObject({ status: "blocked", issues: [{ code: "inconsistent-selection" }] });
  });
  it.each(["actor", "revision", "copy", "released"])("rejects a changed binding: %s", async mode => {
    const state = await setup(), command = { ...state.command };
    if (mode === "actor") command.actorId = "teacher-1";
    if (mode === "revision") command.actorRevision++;
    if (mode === "copy") command.inspection = structuredClone(command.inspection);
    if (mode === "released") releaseBackupInspectionPreview(state.inspection);
    await expect(state.service.reviewAssessments(command)).rejects.toThrow("проверьте файл заново");
    expect(state.service.isSelectionCurrent(command)).toBe(false);
  });
  it("rejects local changes before reading the file", async () => {
    const state = await setup(), read = vi.spyOn(state.file, "arrayBuffer"); state.values.set("bi-university-theme", "light");
    await expect(state.service.reviewAssessments(state.command)).rejects.toThrow("проверьте файл заново"); expect(read).not.toHaveBeenCalled();
  });
  it("rejects an archive with a different digest without logging its contents", async () => {
    const state = await setup(); vi.spyOn(state.file, "arrayBuffer").mockResolvedValue(new TextEncoder().encode("PRIVATE REPLACEMENT").buffer);
    await expect(state.service.reviewAssessments(state.command)).rejects.toThrow("проверьте файл заново");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("PRIVATE");
  });
  it.each(["storage", "reset", "choice", "release"])("rejects %s changes during an asynchronous review", async mode => {
    const state = await setup(); await state.choose("archive"); const read = state.file.arrayBuffer.bind(state.file);
    vi.spyOn(state.file, "arrayBuffer").mockImplementation(async () => {
      if (mode === "storage") state.values.set("bi-university-theme", "dark");
      if (mode === "reset") clearBackupConflictChoices(state.inspection);
      if (mode === "choice") state.service.choose({ ...state.command, difference: state.differences[0], version: "browser" });
      if (mode === "release") releaseBackupInspectionPreview(state.inspection);
      return read();
    });
    await expect(state.service.reviewAssessments(state.command)).rejects.toThrow("проверьте файл заново");
  });
  it("rechecks authority after the asynchronous file read", async () => {
    const state = await setup(); state.authorize.mockReset().mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.reviewAssessments(state.command)).rejects.toThrow("Доступ отозван");
    expect(state.service.isSelectionCurrent(state.command)).toBe(false);
  });
  it("stops on cancellation without returning a partial review", async () => {
    const state = await setup(), controller = new AbortController(); controller.abort();
    await expect(state.service.reviewAssessments({ ...state.command, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
