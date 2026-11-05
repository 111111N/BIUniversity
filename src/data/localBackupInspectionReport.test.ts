import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupInspection } from "./localBackupInspectionService";
import { prepareBackupInspectionReport } from "./localBackupInspectionReport";
import { BACKUP_LIMITS } from "../domain/localBackup";
import { validateAdministrativeBackup } from "../domain/localBackupValidation";
import { compareBackupPlannerRecords } from "../domain/backupPlannerComparison";
import { getPlannerStorageKey } from "../domain/plannerStorage";
import { compareBackupCatalogRecords } from "../domain/backupCatalogComparison";
import { coreBackupFixture, learningBackupFixture } from "../testSupport/localBackupDocuments";
import { compareBackupAccountRecords } from "../domain/backupAccountComparison";
import { compareBackupLearningRecords } from "../domain/backupLearningComparison";
import { compareBackupScheduleRecords } from "../domain/backupScheduleComparison";

const report = (): BackupInspection => ({
  actor: { id: "configurator-demo", revision: 3 }, filename: "original.json",
  source: { origin: "https://portal.example", basePath: "/BIUniversity/" },
  completedAt: "2026-10-28T10:00:00.000Z", inspectedAt: "2026-10-29T10:00:00.000Z", sha256: "a".repeat(64),
  totals: { storageEntries: 4, databaseRecords: 2, files: 2, binaryBytes: 10 },
  warnings: ["Проверки учебных связей частичные"],
  documents: { checks: [], uncheckedKeys: Array.from({ length: 7 }, (_, index) => `bi-university-unknown:${index}`), counts: { valid: 4, invalid: 0, absent: 0, unchecked: 7, errors: 230, reviews: 1 },
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
  it.each(["missing-detail", "unknown-version", "unversioned-detail", "blank-subject", "blank-group", "flat-address", "partial-list"])("rejects incomplete scoped journal comparison: %s", async (kind) => {
    const fixture = coreBackupFixture(); const lesson = fixture.schedule.drafts[0].lessons[0];
    fixture.schedule.drafts = []; fixture.schedule.journal = [{ ...lesson, journalState: "cancelled" }]; fixture.save();
    const inspection = report(); inspection.scheduleComparison = await compareBackupScheduleRecords(fixture.archive.localStorage, []); const review = inspection.scheduleComparison;
    if (kind === "missing-detail") Reflect.deleteProperty(review, "journal");
    if (kind === "unknown-version") Object.assign(review, { journalComparisonVersion: 2 });
    if (kind === "unversioned-detail") Reflect.deleteProperty(review, "journalComparisonVersion");
    if (kind === "blank-subject") Object.assign(review.journal!.differences[0].reference!, { subjectId: "" });
    if (kind === "blank-group") Object.assign(review.journal!.differences[0].reference!, { groupId: " " });
    if (kind === "flat-address") Object.assign(review.journal!.differences[0], { reference: { storage: "localStorage-record", key: "bi-university-managed-schedule-v1", collection: "schedule-published", id: "managed:lesson-1" } });
    if (kind === "partial-list") review.journal!.differences.pop();
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("неполный отчёт");
  });
  it("exports every historical area beyond the UI page without collapsing the lesson ID", async () => {
    const fixture = coreBackupFixture(); const lesson = fixture.schedule.drafts[0].lessons[0];
    fixture.schedule.drafts = []; fixture.schedule.journal = Array.from({ length: 230 }, (_, index) => ({ ...lesson, groupId: `group-${String(index).padStart(3, "0")}`, room: "PRIVATE ROOM", journalState: "cancelled" })); fixture.save();
    const inspection = report(); inspection.scheduleComparison = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.scheduleComparison.journal.differences).toHaveLength(230); expect(saved.scheduleComparison.journal.differences.at(-1).reference.groupId).toBe("group-229");
    expect(saved.scheduleComparison.journal).toEqual(inspection.scheduleComparison.journal); expect(JSON.stringify(saved)).not.toContain("PRIVATE");
  });
  it("keeps legacy schedule reports downloadable without invented journal records", async () => {
    const fixture = coreBackupFixture(); const inspection = report(); inspection.scheduleComparison = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    Reflect.deleteProperty(inspection.scheduleComparison, "journal"); Reflect.deleteProperty(inspection.scheduleComparison, "journalComparisonVersion");
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.scheduleComparison).not.toHaveProperty("journal"); expect(saved.scheduleComparison).not.toHaveProperty("journalComparisonVersion");
  });
  it.each(["partial-list", "wrong-mode", "wrong-key", "unknown-field"])("rejects an incomplete schedule comparison: %s", async (kind) => {
    const fixture = coreBackupFixture(); const inspection = report(); inspection.scheduleComparison = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    const review = inspection.scheduleComparison.drafts;
    if (kind === "partial-list") review.differences.pop();
    if (kind === "wrong-mode") Object.assign(review.differences[0].reference!, { collection: "schedule-published" });
    if (kind === "wrong-key") Object.assign(review.differences[0].reference!, { key: "bi-university-managed-schedule-v2" });
    if (kind === "unknown-field") Object.assign(review.differences[0], { fields: ["PRIVATE"] });
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("неполный отчёт");
  });
  it.each(["missing-detail", "unknown-version", "unversioned-detail", "blank-parent", "flat-address", "partial-list", "partial-uncompared"])("rejects an incomplete scoped-attempt section: %s", async (kind) => {
    const fixture = learningBackupFixture();
    if (kind === "partial-uncompared") { fixture.submissions[0].attempts = undefined; fixture.save(); }
    const inspection = report(); inspection.learningComparison = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    const review = inspection.learningComparison;
    if (kind === "missing-detail") Reflect.deleteProperty(review, "attempts");
    if (kind === "unknown-version") Object.assign(review, { attemptComparisonVersion: 2 });
    if (kind === "unversioned-detail") Reflect.deleteProperty(review, "attemptComparisonVersion");
    if (kind === "blank-parent") Object.assign(review.attempts!.differences[0].reference!, { parentId: "" });
    if (kind === "flat-address") Object.assign(review.attempts!.differences[0], { reference: { storage: "localStorage-record", key: "bi-university-demo-submissions", collection: "submissions", id: "attempt-1" } });
    if (kind === "partial-list") review.attempts!.differences.pop();
    if (kind === "partial-uncompared") review.attempts!.uncompared.pop();
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("неполный отчёт");
  });
  it("keeps legacy learning reports downloadable without inventing attempt detail", async () => {
    const fixture = learningBackupFixture(); const inspection = report(); inspection.learningComparison = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    Reflect.deleteProperty(inspection.learningComparison, "attempts"); Reflect.deleteProperty(inspection.learningComparison, "attemptComparisonVersion");
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.learningComparison).not.toHaveProperty("attempts"); expect(saved.learningComparison).not.toHaveProperty("attemptComparisonVersion");
  });
  it("retains every learning record after 200 without answer texts or attempt contents", async () => {
    const fixture = learningBackupFixture(); const row = fixture.submissions[0];
    fixture.submissions.splice(0, 1, ...Array.from({ length: 230 }, (_, index) => ({ ...row, id: `answer-${String(index).padStart(3, "0")}` }))); fixture.save();
    const inspection = report(); inspection.learningComparison = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.learningComparison.submissions.differences).toHaveLength(230); expect(saved.learningComparison.submissions.differences.at(-1).id).toBe("answer-229");
    expect(saved.learningComparison).toEqual(inspection.learningComparison); expect(JSON.stringify(saved)).not.toContain("PRIVATE");
    expect(saved.learningComparison.attempts.differences).toHaveLength(230);
  });
  it.each(["partial-list", "wrong-collection", "wrong-key", "missing-count", "unknown-field", "partial-uncompared"])("rejects an incomplete learning comparison: %s", async (reason) => {
    const fixture = learningBackupFixture(); const inspection = report();
    if (reason === "partial-uncompared") { fixture.submissions[0].text = "PRIVATE CONFLICT"; fixture.save(); }
    inspection.learningComparison = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    const review = inspection.learningComparison.submissions;
    if (reason === "partial-list") review.differences.pop();
    if (reason === "wrong-collection") Object.assign(review.differences[0].reference!, { collection: "assignments" });
    if (reason === "wrong-key") Object.assign(review.differences[0].reference!, { key: "bi-university-demo-submissions-v2" });
    if (reason === "missing-count") Reflect.deleteProperty(review.counts, "same");
    if (reason === "unknown-field") Object.assign(review.differences[0], { fields: ["PRIVATE_FIELD"] });
    if (reason === "partial-uncompared") review.uncompared.pop();
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("неполный отчёт");
  });
  it("exports every account ID beyond the visible page without names or logins", async () => {
    const fixture = coreBackupFixture(); const student = fixture.accounts.accounts[2];
    fixture.accounts.accounts = [fixture.accounts.accounts[0], ...Array.from({ length: 230 }, (_, index) => ({ ...student, id: `student-${String(index).padStart(3, "0")}`, name: `PRIVATE ${index}`, login: `private.student.${index}` }))]; fixture.save();
    const inspection = report(); inspection.accountComparison = await compareBackupAccountRecords(fixture.archive.localStorage, []);
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.accountComparison.differences).toHaveLength(231); expect(saved.accountComparison.differences.at(-1).id).toBe("student-229");
    expect(saved.accountComparison).toEqual(inspection.accountComparison); expect(JSON.stringify(saved)).not.toContain("PRIVATE"); expect(JSON.stringify(saved)).not.toContain("private.student");
  });
  it.each(["partial-list", "wrong-collection", "wrong-key", "missing-count", "unknown-field", "partial-uncompared"])("rejects an incomplete account comparison: %s", async (reason) => {
    const fixture = coreBackupFixture(); const inspection = report();
    inspection.accountComparison = await compareBackupAccountRecords(reason === "partial-uncompared" ? [{ key: "bi-university-accounts-v1", raw: "PRIVATE{broken" }] : fixture.archive.localStorage, []);
    const review = inspection.accountComparison;
    if (reason === "partial-list") review.differences.pop();
    if (reason === "wrong-collection") Object.assign(review.differences[0].reference!, { collection: "subjects" });
    if (reason === "wrong-key") Object.assign(review.differences[0].reference!, { key: "bi-university-accounts-v2" });
    if (reason === "missing-count") Reflect.deleteProperty(review.counts, "same");
    if (reason === "unknown-field") Object.assign(review.differences[0], { fields: ["PRIVATE_FIELD"] });
    if (reason === "partial-uncompared") review.uncompared.pop();
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("неполный отчёт");
  });
  it("keeps every catalog card beyond the UI page without exporting names or histories", async () => {
    const fixture = coreBackupFixture(); const row = fixture.subjects.subjects[0];
    fixture.subjects.subjects = Array.from({ length: 230 }, (_, index) => ({ ...row, id: `subject-${String(index).padStart(3, "0")}`, name: `PRIVATE ${index}`, shortName: `S${index}` })); fixture.save();
    const inspection = report(); inspection.catalogComparison = await compareBackupCatalogRecords(fixture.archive.localStorage, []);
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.catalogComparison.subjects.differences).toHaveLength(230); expect(saved.catalogComparison.subjects.differences.at(-1).id).toBe("subject-229");
    expect(saved.catalogComparison).toEqual(inspection.catalogComparison); expect(JSON.stringify(saved)).not.toContain("PRIVATE");
  });
  it.each(["partial-list", "wrong-collection", "missing-count", "unknown-field"])("blocks an incomplete catalog report: %s", async (reason) => {
    const fixture = coreBackupFixture(); const inspection = report(); inspection.catalogComparison = await compareBackupCatalogRecords(fixture.archive.localStorage, []);
    const review = inspection.catalogComparison.groups;
    if (reason === "partial-list") review.differences.pop();
    if (reason === "wrong-collection") Object.assign(review.differences[0].reference!, { collection: "subjects" });
    if (reason === "missing-count") Reflect.deleteProperty(review.counts, "same");
    if (reason === "unknown-field") Object.assign(review.differences[0], { fields: ["PRIVATE_FIELD"] });
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("В результате сравнения записей отсутствует часть данных");
  });
  it("retains a complete entity comparison without copying task contents", async () => {
    const inspection = report(); const key = getPlannerStorageKey("student-1");
    inspection.plannerComparison = await compareBackupPlannerRecords([{ key, raw: JSON.stringify([{ id: "task-1", title: "PRIVATE", createdAt: "2026-11-02T00:00Z" }]) }], []);
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.plannerComparison).toEqual(inspection.plannerComparison); expect(JSON.stringify(saved)).not.toContain("PRIVATE");
  });
  it.each(["partial-list", "unknown-field", "wrong-address", "missing-uncompared"])("rejects an incomplete planner comparison: %s", async (reason) => {
    const inspection = report(); const key = getPlannerStorageKey("student-1");
    inspection.plannerComparison = await compareBackupPlannerRecords([{ key, raw: reason === "missing-uncompared" ? "PRIVATE{broken" : JSON.stringify([{ id: "task-1", title: "PRIVATE", createdAt: "2026-11-02T00:00Z" }]) }], []);
    const review = inspection.plannerComparison;
    if (reason === "partial-list") review.differences.pop();
    if (reason === "unknown-field") Object.assign(review.differences[0], { fields: ["PRIVATE_FIELD"] });
    if (reason === "wrong-address") Object.assign(review.differences[0], { reference: { storage: "localStorage", key } });
    if (reason === "missing-uncompared") review.uncompared.pop();
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("В результате сравнения задач отсутствует часть записей");
  });
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
  it("exports all unreviewed keys beyond the visible page without copying their values", async () => {
    const inspection = report();
    inspection.documents.uncheckedKeys = Array.from({ length: 205 }, (_, index) => `bi-university-unknown:${index}`);
    inspection.documents.counts.unchecked = 205;
    const saved = JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text());
    expect(saved.documents.uncheckedKeys).toEqual(inspection.documents.uncheckedKeys);
    expect(saved.documents.uncheckedKeys.at(-1)).toBe("bi-university-unknown:204");
    expect(saved).not.toHaveProperty("localStorage");
  });
  it.each(["missing", "partial", "duplicate", "outside-namespace"])("rejects an incomplete unreviewed-key inventory: %s", (state) => {
    const inspection = report();
    if (state === "missing") delete inspection.documents.uncheckedKeys;
    if (state === "partial") inspection.documents.uncheckedKeys!.pop();
    if (state === "duplicate") inspection.documents.uncheckedKeys![0] = inspection.documents.uncheckedKeys![1];
    if (state === "outside-namespace") inspection.documents.uncheckedKeys![0] = "unrelated-key";
    expect(() => prepareBackupInspectionReport(command(inspection), vi.fn())).toThrow("полный перечень непроверенных ключей");
  });
  it("keeps count-only reports compatible when no keys are unreviewed", async () => {
    const inspection = report(); delete inspection.documents.uncheckedKeys; inspection.documents.counts.unchecked = 0;
    expect(JSON.parse(await prepareBackupInspectionReport(command(inspection), vi.fn()).blob.text()).documents.counts.unchecked).toBe(0);
  });
});
