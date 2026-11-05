import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteLearningComparison, compareBackupLearningRecords, getUncheckedLearningDocuments } from "./backupLearningComparison";
import { getBackupDifferenceKey } from "./backupComparison";
import { learningBackupFixture } from "../testSupport/localBackupDocuments";
import type { SubmissionAttempt } from "../data/assignmentStore";

const KEY = "bi-university-demo-submissions";
const setup = () => {
  const fixture = learningBackupFixture(); const row = fixture.submissions[0];
  const first: SubmissionAttempt = { id: "attempt-1", number: 1, sentAt: "2026-10-28T09:00:00Z", updatedAt: "2026-10-28T09:10:00Z", text: "PRIVATE FIRST", status: "submitted", submittedLate: false };
  const last: SubmissionAttempt = { ...first, id: "attempt-2", number: 2, sentAt: "2026-10-28T10:00:00Z", updatedAt: "2026-10-28T10:10:00Z", text: "PRIVATE LAST" };
  Object.assign(row, { attempts: [first, last], sentAt: first.sentAt, updatedAt: last.updatedAt, text: last.text, attemptCount: 2 });
  fixture.save();
  return { ...fixture, row, first, last };
};
const forbidden = vi.fn(() => { throw new Error("No live reads, writes or invented attempts"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("attempt comparison scoped to a parent answer", () => {
  it("keeps identical attempt IDs in different answers separate and preserves both snapshots", async () => {
    const fixture = setup(); fixture.submissions.push({ ...fixture.row, id: "answer-2" }); fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await compareBackupLearningRecords(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(review.attempts?.counts).toMatchObject({ same: 4, different: 0, uncheckedDocuments: 0 });
    expect(review.attempts?.differences).toEqual([]); expect(review.attemptComparisonVersion).toBe(1);
    expect(() => assertCompleteLearningComparison(review)).not.toThrow(); expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("reports every value field of one historical attempt without exporting its contents", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.first, { sentAt: "2026-10-28T08:00:00Z", updatedAt: "2026-10-28T09:20:00Z", text: "PRIVATE CHANGED", attachmentId: "PRIVATE FILE ID", attachmentName: "PRIVATE.pdf", status: "graded", submittedLate: true, teacherComment: "PRIVATE COMMENT", grade: "PRIVATE GRADE", reviewedAt: "2026-10-28T08:30:00Z" });
    fixture.row.sentAt = fixture.first.sentAt; fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.attempts?.counts).toMatchObject({ same: 1, different: 1 });
    expect(review.attempts?.differences[0]).toMatchObject({ id: "attempt-1", fields: ["sentAt", "updatedAt", "text", "attachmentId", "attachmentName", "status", "submittedLate", "teacherComment", "grade", "reviewedAt"], reference: { storage: "localStorage-child-record", collection: "submission-attempts", key: KEY, parentId: "answer-1", id: "attempt-1" } });
    expect(JSON.stringify(review.attempts)).not.toContain("PRIVATE");
  });
  it("matches by ID, not array position or attempt number", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    fixture.first.id = "attempt-2"; fixture.last.id = "attempt-1"; fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.attempts?.counts).toMatchObject({ same: 0, new: 0, currentOnly: 0, different: 2 });
    expect(review.attempts?.differences.every((item) => item.fields.includes("number"))).toBe(true);
  });
  it("does not match an attempt across changed parent IDs even when all values match", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage); fixture.row.id = "answer-2"; fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.attempts?.counts).toMatchObject({ same: 0, new: 2, currentOnly: 2 });
    expect(new Set(review.attempts!.differences.map(getBackupDifferenceKey)).size).toBe(4);
  });
  it("keeps one parent's change isolated and treats malicious-looking metadata as data", async () => {
    const fixture = setup(); fixture.row.id = 'answer"]:one';
    fixture.submissions.push({ ...fixture.row, id: 'answer:two"]', attempts: structuredClone(fixture.row.attempts) }); fixture.save();
    const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.first, { parentId: 'answer:two"]', PRIVATE_EXTENSION: "PRIVATE" }); fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.attempts?.counts).toMatchObject({ same: 3, different: 1 });
    expect(review.attempts?.differences[0].fields).toEqual(["other"]);
    expect(review.attempts?.differences[0].reference).toMatchObject({ parentId: 'answer"]:one' });
    expect(JSON.stringify(review.attempts)).not.toContain("PRIVATE");
  });
  it.each(["absent", "empty"])("does not turn an %s legacy history into deleted attempts", async (kind) => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.row, { attempts: kind === "empty" ? [] : undefined, attemptCount: 1 }); fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.submissions.counts.uncheckedDocuments).toBe(0); expect(review.attempts?.counts).toMatchObject({ comparedDocuments: 0, uncheckedDocuments: 1, new: 0, currentOnly: 0 });
    expect(review.attempts?.uncompared).toEqual([{ key: KEY, source: "browser", reason: "missing-history" }]);
    expect(review.attempts?.differences).toEqual([]); expect(JSON.stringify(fixture.archive)).toBe(before); expect(getUncheckedLearningDocuments(review)).toBe(1);
  });
  it("does not publish a partial history list when one of several parents is legacy", async () => {
    const fixture = setup(); const original = structuredClone(fixture.archive.localStorage);
    fixture.submissions.push({ ...fixture.row, id: "legacy-parent", attempts: undefined, attemptCount: 1 }); fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.attempts?.uncompared[0].reason).toBe("missing-history"); expect(review.attempts?.differences).toEqual([]);
  });
  it("distinguishes an explicitly empty source document from a record with unproven history", async () => {
    const fixture = setup(); const review = await compareBackupLearningRecords(fixture.archive.localStorage, [{ key: KEY, raw: "[]" }]);
    expect(review.attempts?.counts).toMatchObject({ comparedDocuments: 1, uncheckedDocuments: 0, new: 2 });
  });
  it("counts an inconsistent document once even when cards and histories both cannot be compared", async () => {
    const fixture = setup(); fixture.row.text = "PRIVATE CONFLICT"; fixture.save();
    const review = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    expect(review.submissions.counts.uncheckedDocuments).toBe(1); expect(review.attempts?.counts.uncheckedDocuments).toBe(1);
    expect(getUncheckedLearningDocuments(review)).toBe(1); expect(() => assertCompleteLearningComparison(review)).not.toThrow();
  });
  it("retains all scoped attempts after 200 and rejects a truncated detail section", async () => {
    const fixture = setup(); fixture.submissions.splice(0, 1, ...Array.from({ length: 230 }, (_, index) => ({ ...fixture.row, id: `answer-${String(index).padStart(3, "0")}` }))); fixture.save();
    const review = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    expect(review.attempts?.counts.new).toBe(460); expect(review.attempts?.differences.at(-1)?.reference).toMatchObject({ parentId: "answer-229", id: "attempt-2" });
    expect(() => assertCompleteLearningComparison(review)).not.toThrow(); review.attempts!.differences.pop();
    expect(() => assertCompleteLearningComparison(review)).toThrow("неполный отчёт");
  });
  it.each(["missing-detail", "unknown-version", "blank-parent", "flat-address"])("rejects an incomplete attempt address or version: %s", async (kind) => {
    const fixture = setup(); const review = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    if (kind === "missing-detail") Reflect.deleteProperty(review, "attempts");
    if (kind === "unknown-version") Object.assign(review, { attemptComparisonVersion: 2 });
    if (kind === "blank-parent") Object.assign(review.attempts!.differences[0].reference!, { parentId: "" });
    if (kind === "flat-address") Object.assign(review.attempts!.differences[0], { reference: { storage: "localStorage-record", key: KEY, collection: "submissions", id: "attempt-1" } });
    expect(() => assertCompleteLearningComparison(review)).toThrow("неполный отчёт");
  });
  it("keeps old read-only results compatible without inventing detail or addresses", async () => {
    const fixture = setup(); const review = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    Reflect.deleteProperty(review, "attempts"); Reflect.deleteProperty(review, "attemptComparisonVersion");
    expect(() => assertCompleteLearningComparison(review)).not.toThrow();
  });
});
