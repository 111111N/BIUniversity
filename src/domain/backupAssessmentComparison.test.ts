import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentBackupFixture } from "../testSupport/assessmentBackup";
import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument } from "./assessmentTypes";
import { decodeAssessmentDocument } from "./assessments";
import { assertCompleteAssessmentComparison, compareBackupAssessmentRecords, getUncheckedAssessmentDocuments } from "./backupAssessmentComparison";
import { canPreviewBackupDifference, readBackupRecordPreview } from "./backupRecordPreview";
import { BACKUP_LIMITS } from "./localBackup";

const entry = (document: AssessmentDocument) => ({ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(document) });
const changedResults = () => {
  const first = assessmentBackupFixture("exam", true).document;
  const second = structuredClone(first);
  second.assessments[0].title = "PRIVATE CHANGED TITLE"; second.assessments[0].period = "PRIVATE CHANGED PERIOD";
  for (const attempt of second.assessments[0].attempts) for (const result of attempt.results) result.outcome = { status: "graded", grade: 2 };
  for (const event of second.history) for (const result of event.results ?? []) result.outcome = { status: "graded", grade: 2 };
  decodeAssessmentDocument(JSON.stringify(second));
  return { first, second };
};
const forbidden = vi.fn(() => { throw new Error("No live storage access in backup comparison"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("read-only assessment backup comparison", () => {
  it("matches IDs and semantic values despite JSON property order and formatting", async () => {
    const document = assessmentBackupFixture().document;
    const ordered = { ...document, assessments: document.assessments.map((row) => Object.fromEntries(Object.entries(row).reverse())) };
    const archive = [entry(document)]; const browser = [{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(ordered, null, 2) }];
    const before = JSON.stringify([archive, browser]); const review = await compareBackupAssessmentRecords(archive, browser);
    expect(review.assessments.counts).toMatchObject({ documents: 1, same: 1, different: 0 });
    expect(review.history.counts.same).toBe(document.history.length);
    expect(() => assertCompleteAssessmentComparison(review)).not.toThrow();
    expect(JSON.stringify([archive, browser])).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("reports changed attempts and audit snapshots without exposing names, grades or other values", async () => {
    const { first, second } = changedResults();
    const review = await compareBackupAssessmentRecords([entry(first)], [entry(second)]);
    expect(review.assessments.differences[0]).toMatchObject({ kind: "different", id: first.assessments[0].id, fields: ["title", "period", "attempts"] });
    expect(review.history.differences).toHaveLength(4);
    expect(review.history.differences.every((difference) => difference.fields.join() === "results")).toBe(true);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(review).not.toHaveProperty("selectedVersion");
    expect(() => assertCompleteAssessmentComparison(review)).not.toThrow();
  });
  it("preserves archive-only and browser-only IDs without joining records by title", async () => {
    const first = assessmentBackupFixture().document; const second = structuredClone(first);
    second.assessments[0].id = "another-assessment";
    for (const event of second.history) { event.id = `other-${event.id}`; event.assessmentId = "another-assessment"; }
    const review = await compareBackupAssessmentRecords([entry(first)], [entry(second)]);
    expect(review.assessments.counts).toMatchObject({ same: 0, new: 1, currentOnly: 1 });
    expect(review.history.counts).toMatchObject({ same: 0, new: first.history.length, currentOnly: first.history.length });
    expect((await compareBackupAssessmentRecords([entry(first)], [])).assessments.counts.new).toBe(1);
  });
  it.each(["archive", "browser"] as const)("does not salvage an inconsistent %s document", async (source) => {
    const document = assessmentBackupFixture().document; const valid = entry(document);
    const invalid = { ...valid, raw: JSON.stringify({ ...document, history: document.history.slice(1) }) };
    const review = await compareBackupAssessmentRecords([source === "archive" ? invalid : valid], [source === "browser" ? invalid : valid]);
    expect(getUncheckedAssessmentDocuments(review)).toBe(1);
    for (const comparison of [review.assessments, review.history]) {
      expect(comparison.counts.comparedDocuments).toBe(0); expect(comparison.differences).toEqual([]);
      expect(comparison.uncompared).toEqual([{ key: ASSESSMENTS_STORAGE_KEY, source, reason: "invalid-document" }]);
    }
  });
  it("keeps repeated keys and unknown key generations uncomparable", async () => {
    const source = entry(assessmentBackupFixture().document);
    const duplicate = await compareBackupAssessmentRecords([source, source], []);
    expect(duplicate.assessments.uncompared[0].reason).toBe("duplicate-key");
    const unknown = await compareBackupAssessmentRecords([{ ...source, key: "bi-university-assessments-v99" }], []);
    expect(unknown.history.uncompared[0].reason).toBe("unsupported-key");
    expect(getUncheckedAssessmentDocuments(unknown)).toBe(1);
  });
  it("uses strict legacy conversion and exposes its provenance as a difference rather than an automatic winner", async () => {
    const document = assessmentBackupFixture().document;
    const legacy = JSON.parse(JSON.stringify(document)); legacy.version = 2;
    delete legacy.corrections; delete legacy.correctionHistory;
    for (const event of legacy.history) delete event.assignment;
    const review = await compareBackupAssessmentRecords([{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(legacy) }], [entry(document)]);
    expect(review.assessments.counts.same).toBe(1);
    expect(review.history.differences).toHaveLength(1); expect(review.history.differences[0].fields).toEqual(["assignmentOrigin"]);
    const preview = await readBackupRecordPreview([{ key: ASSESSMENTS_STORAGE_KEY, raw: JSON.stringify(legacy) }], [entry(document)], review.history.differences[0]);
    expect(preview.rows[0]).toMatchObject({ field: "assignmentOrigin", archive: '"legacy-snapshot"', browser: "Поле отсутствует" });
  });
  it("reveals complete values only for a confirmed conflict and rejects stale or forged addresses", async () => {
    const { first, second } = changedResults(); const archive = [entry(first)]; const browser = [entry(second)];
    const review = await compareBackupAssessmentRecords(archive, browser); const difference = review.assessments.differences[0];
    expect(canPreviewBackupDifference(difference)).toBe(true);
    const preview = await readBackupRecordPreview(archive, browser, difference);
    expect(preview.hasUnpreviewedFields).toBe(false);
    expect(preview.rows.find((row) => row.field === "attempts")).toMatchObject({ label: "Попытки и результаты" });
    expect(preview.rows[0]).toMatchObject({ archive: '"PRIVATE ASSESSMENT TITLE"', browser: '"PRIVATE CHANGED TITLE"' });
    await expect(readBackupRecordPreview(archive, archive, difference)).rejects.toThrow("больше не подтверждён");
    const forged = { ...difference, id: "missing", reference: { storage: "localStorage-record" as const, key: ASSESSMENTS_STORAGE_KEY, collection: "assessments" as const, id: "missing" } };
    await expect(readBackupRecordPreview(archive, browser, forged)).rejects.toThrow("больше не подтверждён");
    expect(forbidden).not.toHaveBeenCalled();
  });
  it("refuses oversized previews rather than showing a truncated version as fully reviewed", async () => {
    const document = assessmentBackupFixture().document; const second = structuredClone(document);
    const students = Array.from({ length: 1600 }, (_, index) => ({ studentId: `peer-${index}`, name: `PRIVATE ${index} ${"Ф".repeat(50)}`, studentNumber: null }));
    for (const state of [document, second]) {
      state.assessments[0].roster.push(...structuredClone(students));
      state.assessments[0].attempts[0].studentIds.push(...students.map((row) => row.studentId));
      state.assessments[0].attempts[0].results.push(...students.map((row) => ({ studentId: row.studentId, outcome: { status: "graded" as const, grade: 5 as const } })));
      state.history[0].assignment!.studentIds.push(...students.map((row) => row.studentId));
      for (const event of state.history) if (event.results) event.results = structuredClone(state.assessments[0].attempts[0].results);
    }
    second.assessments[0].roster[1].name = "PRIVATE CHANGED NAME";
    const review = await compareBackupAssessmentRecords([entry(document)], [entry(second)]);
    await expect(readBackupRecordPreview([entry(document)], [entry(second)], review.assessments.differences[0])).rejects.toThrow("слишком велики");
  });
  it("honors aborts and text limits without partial output", async () => {
    const source = entry(assessmentBackupFixture().document); const controller = new AbortController(); controller.abort();
    await expect(compareBackupAssessmentRecords([source], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(compareBackupAssessmentRecords([{ ...source, raw: "x".repeat(BACKUP_LIMITS.textBytes / 2 + 1) }], [])).rejects.toThrow("лимит");
  });
  it("does not export incomplete audit comparisons", async () => {
    const source = entry(assessmentBackupFixture().document);
    const review = await compareBackupAssessmentRecords([source], []);
    review.history.differences.pop();
    expect(() => assertCompleteAssessmentComparison(review)).toThrow("неполный отчёт");
    Reflect.deleteProperty(review, "history");
    expect(() => assertCompleteAssessmentComparison(review)).toThrow("неполно");
  });
  it("rejects an individually valid audit comparison from a different document set", async () => {
    const source = entry(assessmentBackupFixture().document);
    const review = await compareBackupAssessmentRecords([source], []);
    review.history = (await compareBackupAssessmentRecords([], [])).history;
    expect(() => assertCompleteAssessmentComparison(review)).toThrow("неполный отчёт");
  });
});
