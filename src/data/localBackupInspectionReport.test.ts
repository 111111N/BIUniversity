import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupInspection } from "./localBackupInspectionService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";
import { BACKUP_LIMITS } from "../domain/localBackup";
import { validateAdministrativeBackup } from "../domain/localBackupValidation";

const report = (): BackupInspection => ({
  actor: { id: "configurator-demo", revision: 3 }, filename: "original.json",
  source: { origin: "https://portal.example", basePath: "/BIUniversity/" },
  completedAt: "2026-10-28T10:00:00.000Z", inspectedAt: "2026-10-29T10:00:00.000Z", sha256: "a".repeat(64),
  totals: { storageEntries: 4, databaseRecords: 2, files: 2, binaryBytes: 10 },
  warnings: ["Проверки учебных связей частичные"],
  documents: { checks: [], counts: { valid: 4, invalid: 0, absent: 0, unchecked: 7, errors: 230, reviews: 1 },
    issues: [
      ...Array.from({ length: 230 }, (_, index) => ({ level: "error" as const, kind: "accounts" as const, code: "missing-group", referenceId: `group-${index}`, message: "Группа отсутствует" })),
      { level: "review", kind: "accounts", code: "unchecked-access", message: "Нужна проверка доступа" },
    ],
  },
  comparison: { same: 1, new: 1, different: 0, currentOnly: 1, schema: 0, differences: [
    { kind: "new", area: "Материалы", id: "archive-only" },
    { kind: "current-only", area: "Материалы", id: "browser-only" },
  ] },
});
const command = (inspection = report()) => ({ actorId: "configurator-demo", actorRevision: 3, inspection });
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());

describe("complete backup inspection report", () => {
  it("exports every finding and comparison with archive identity without duplicating its contents", async () => {
    const inspection = report(); const before = JSON.stringify(inspection); const authorize = vi.fn();
    const file = prepareBackupInspectionReport(command(inspection), authorize);
    const saved = JSON.parse(await file.blob.text());
    expect(saved).toMatchObject({ format: "bi-university-backup-inspection", version: 1, scope: "administrative", actor: inspection.actor, inspectedAt: inspection.inspectedAt });
    expect(saved.archive).toEqual({ filename: inspection.filename, sha256: inspection.sha256, source: inspection.source, completedAt: inspection.completedAt, totals: inspection.totals });
    expect(saved.documents.issues).toHaveLength(231);
    expect(saved.documents.issues[229].referenceId).toBe("group-229");
    expect(saved.documents).toEqual(inspection.documents); expect(saved.comparison).toEqual(inspection.comparison); expect(saved.warnings).toEqual(inspection.warnings);
    expect(saved).not.toHaveProperty("localStorage"); expect(saved).not.toHaveProperty("databases");
    expect(file.filename).toBe("bi-university-inspection-2026-10-29T10-00-00-000Z.json");
    expect(file.blob.type).toBe("application/json;charset=utf-8");
    expect(authorize).toHaveBeenCalledTimes(2); expect(JSON.stringify(inspection)).toBe(before);
  });

  it.each([{ id: "other-admin", revision: 3 }, { id: "configurator-demo", revision: 4 }])("rejects a changed report owner or revision: %j", (actor) => {
    const inspection = report(); inspection.actor = actor;
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("Учётная запись изменилась");
  });

  it("does not generate a file when initial access is denied", () => {
    const authorize = vi.fn(() => { throw new Error("Доступ отозван"); });
    expect(() => prepareBackupInspectionReport(command(), authorize)).toThrow("Доступ отозван");
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("rechecks access immediately before returning a prepared file", () => {
    const authorize = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("Доступ отозван"); });
    expect(() => prepareBackupInspectionReport(command(), authorize)).toThrow("Доступ отозван");
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it.each(["error", "review"])("rejects a partial %s list instead of exporting a misleading full report", (level) => {
    const inspection = report(); inspection.documents.issues = inspection.documents.issues.filter((issue) => issue.level !== level);
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("отсутствует часть замечаний");
  });

  it("does not export a partial difference list", () => {
    const inspection = report(); inspection.comparison.differences.pop();
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("отсутствует часть различий");
  });

  it("refuses oversized reports without returning a truncated file", () => {
    vi.spyOn(Blob.prototype, "size", "get").mockReturnValue(BACKUP_LIMITS.archiveBytes + 1);
    expect(() => prepareBackupInspectionReport(command(), vi.fn())).toThrow("Частичный файл не скачан");
  });

  it("cannot be mistaken for a restorable administrative backup", async () => {
    const file = prepareBackupInspectionReport(command(), vi.fn());
    await expect(validateAdministrativeBackup(JSON.parse(await file.blob.text()))).rejects.toThrow("это не административная резервная копия");
  });
});
