import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { ASSESSMENTS_STORAGE_KEY } from "../domain/assessmentTypes";
import { assessBackupRestoreAdmission } from "../domain/backupRestoreAdmission";
import type { BackupDependencies } from "./localBackupService";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { createBackupConflictPreviewService, releaseBackupInspectionPreview } from "./localBackupConflictPreviewService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";

const actor = { actorId: "configurator-demo", actorRevision: 1 };
const setup = async () => {
  const fixture = assessmentBackupFixture("exam", true);
  const file = new File([JSON.stringify(fixture.archive)], "assessments.json");
  const current = structuredClone(fixture.document); current.assessments[0].title = "PRIVATE CURRENT TITLE";
  for (const attempt of current.assessments[0].attempts) for (const result of attempt.results) result.outcome = { status: "graded", grade: 2 };
  for (const event of current.history) for (const result of event.results ?? []) result.outcome = { status: "graded", grade: 2 };
  const values = new Map(fixture.archive.localStorage.map((entry) => [entry.key, entry.raw])); values.set(ASSESSMENTS_STORAGE_KEY, JSON.stringify(current));
  const authorize = vi.fn();
  const dependencies: BackupDependencies = {
    storage: { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null },
    authorize, listDatabases: vi.fn(async () => []), readDatabase: vi.fn(), origin: fixture.archive.source.origin, basePath: fixture.archive.source.basePath,
  };
  const inspections = createBackupInspectionService(dependencies);
  const inspection = await inspections.inspect({ ...actor, file });
  return { values, authorize, inspections, inspection, file, service: createBackupConflictPreviewService(dependencies) };
};
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());

describe("assessment conflicts in the authorized archive inspection", () => {
  it("includes both record comparisons in the complete report, excludes private values and keeps the whole archive blocked", async () => {
    const state = await setup(); const before = JSON.stringify([...state.values]);
    const comparison = state.inspection.assessmentComparison!;
    expect(comparison.assessments.counts.different).toBe(1); expect(comparison.history.counts.different).toBe(4);
    const report = prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize);
    const text = await report.blob.text(); const parsed = JSON.parse(text);
    expect(parsed.assessmentComparison).toEqual(comparison); expect(text).not.toContain("PRIVATE");
    expect(parsed.restoreAdmission.status).toBe("blocked");
    expect(parsed.restoreAdmission.blockers.some((entry: { code: string }) => entry.code === "unconfirmed-assessment-authority")).toBe(true);
    expect(JSON.stringify([...state.values])).toBe(before);
    comparison.history.differences.pop();
    expect(() => prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize)).toThrow("неполный отчёт");
  });
  it("requires full explicit preview before choosing either a card or an audit event; the choice never writes data", async () => {
    const state = await setup(); const before = JSON.stringify([...state.values]);
    const differences = [state.inspection.assessmentComparison!.assessments.differences[0], state.inspection.assessmentComparison!.history.differences[0]];
    for (const difference of differences) {
      const command = { ...actor, inspection: state.inspection, difference };
      expect(() => state.service.choose({ ...command, version: "archive" })).toThrow("Сначала просмотрите");
      const preview = await state.service.preview(command);
      expect(preview.hasUnpreviewedFields).toBe(false); expect(preview.rows.length).toBeGreaterThan(0);
      expect([...state.service.choose({ ...command, version: "browser" }).values()]).toContain("browser");
    }
    expect(JSON.stringify([...state.values])).toBe(before);
    expect(assessBackupRestoreAdmission(state.inspection.documents).status).toBe("blocked");
    expect(await prepareBackupInspectionReport({ ...actor, inspection: state.inspection }, state.authorize).blob.text()).not.toContain("PRIVATE");
  });
  it("rejects forged assessment IDs and changes to the source or the actor after inspection", async () => {
    const state = await setup(); const difference = state.inspection.assessmentComparison!.assessments.differences[0];
    const command = { ...actor, inspection: state.inspection, difference };
    const reference = { storage: "localStorage-record" as const, key: ASSESSMENTS_STORAGE_KEY, collection: "assessments" as const, id: "forged" };
    await expect(state.service.preview({ ...command, difference: { ...difference, id: "forged", reference } })).rejects.toThrow("проверьте файл заново");
    await state.service.preview(command);
    state.values.set("bi-university-theme", "dark");
    expect(state.service.isCurrent(command)).toBe(false);
    expect(() => state.service.choose({ ...command, version: "archive" })).toThrow("проверьте файл заново");
    state.values.delete("bi-university-theme");
    state.authorize.mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.preview(command)).rejects.toThrow("Доступ отозван");
    state.authorize.mockReset(); releaseBackupInspectionPreview(state.inspection);
    await expect(state.service.preview(command)).rejects.toThrow("проверьте файл заново");
  });
});
