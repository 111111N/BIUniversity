import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteLearningComparison, compareBackupLearningRecords } from "./backupLearningComparison";
import { learningBackupFixture } from "../testSupport/localBackupDocuments";
import { getBackupDifferenceKey } from "./backupComparison";

const ASSIGNMENTS = "bi-university-demo-assignments", SUBMISSIONS = "bi-university-demo-submissions";
const forbidden = vi.fn(() => { throw new Error("No live learning-store reads or writes"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("read-only assignment and submission comparison", () => {
  it("matches exact IDs without normalizing values or consulting built-in work", async () => {
    const fixture = learningBackupFixture(); const archive = structuredClone(fixture.archive.localStorage);
    const before = JSON.stringify(fixture.archive); const review = await compareBackupLearningRecords(archive, [...archive].reverse());
    expect(review.assignments.counts).toMatchObject({ same: 1, different: 0, uncheckedDocuments: 0 });
    expect(review.submissions.counts).toMatchObject({ same: 1, different: 0, uncheckedDocuments: 0 });
    expect(() => assertCompleteLearningComparison(review)).not.toThrow(); expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("names every assignment field without exporting conditions, names, deadlines or attachments", async () => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.assignments[0], { subjectId: "PRIVATE SUBJECT ID", groupId: "PRIVATE GROUP ID", subject: "PRIVATE SUBJECT", group: "PRIVATE GROUP", lessonDate: "2026-11-02T09:00Z", lessonType: "Лабораторная", title: "PRIVATE NEW TITLE", description: "PRIVATE NEW CONDITION", deadline: "2026-11-05T18:00Z", attachmentId: "PRIVATE FILE ID", attachmentName: "PRIVATE.pdf", status: "closed", allowLateSubmissions: true, createdAt: "2026-11-01T00:00Z", updatedAt: "2026-11-02T00:00Z" }); fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.assignments.differences[0].fields).toEqual(["subjectId", "groupId", "subject", "group", "lessonDate", "lessonType", "title", "description", "deadline", "attachmentId", "attachmentName", "status", "allowLateSubmissions", "createdAt", "updatedAt"]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("2026-11-05");
  });
  it("compares legacy answer fields and leaves missing histories missing", async () => {
    const fixture = learningBackupFixture();
    const old = { id: "answer-1", assignmentId: "task-1", studentId: "student-1", studentName: "PRIVATE OLD", sentAt: "2026-10-28T12:00" };
    const current = { ...old, assignmentId: "PRIVATE TASK", studentId: "PRIVATE STUDENT ID", studentName: "PRIVATE NEW", sentAt: "2026-11-02T12:00Z", text: "PRIVATE TEXT", attachmentId: "PRIVATE FILE", attachmentName: "PRIVATE.pdf", comment: "PRIVATE COMMENT", grade: "PRIVATE GRADE", teacherComment: "PRIVATE TEACHER", status: "graded", updatedAt: "2026-11-02T13:00Z", attemptCount: 1 };
    const archive = [{ key: SUBMISSIONS, raw: JSON.stringify([old]) }], browser = [{ key: SUBMISSIONS, raw: JSON.stringify([current]) }];
    const before = JSON.stringify([archive, browser]); const review = await compareBackupLearningRecords(archive, browser);
    expect(review.submissions.differences[0].fields).toEqual(["assignmentId", "studentId", "studentName", "sentAt", "text", "attachmentId", "attachmentName", "comment", "grade", "teacherComment", "status", "updatedAt", "attemptCount"]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify([archive, browser])).toBe(before); expect(current).not.toHaveProperty("attempts");
    expect(fixture.submissions[0].attempts).toHaveLength(1);
  });
  it("compares the full nested attempt history inside its answer without exposing changed attempt values", async () => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    fixture.submissions[0].text = "PRIVATE NEW ANSWER"; fixture.submissions[0].attempts![0].text = fixture.submissions[0].text;
    Object.assign(fixture.submissions[0].attempts![0], { PRIVATE_EXTENSION: "PRIVATE" }); fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.submissions.differences[0].fields).toEqual(["text", "attempts"]); expect(review.submissions.counts.uncheckedDocuments).toBe(0);
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it.each(["latest-text", "attempt-count", "first-date", "review-time"])("does not choose between contradictory card and attempt values: %s", async (reason) => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    const row = fixture.submissions[0];
    if (reason === "latest-text") row.text = "PRIVATE CONFLICT";
    if (reason === "attempt-count") row.attemptCount = 2;
    if (reason === "first-date") row.sentAt = "2026-10-27T12:00";
    if (reason === "review-time") row.attempts![0].reviewedAt = "2026-10-29T12:00";
    fixture.save(); const before = JSON.stringify(fixture.archive);
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.submissions.counts).toMatchObject({ comparedDocuments: 0, uncheckedDocuments: 1, new: 0, currentOnly: 0 });
    expect(review.submissions.differences).toEqual([]); expect(review.submissions.uncompared).toEqual([{ key: SUBMISSIONS, source: "browser", reason: "invalid-document" }]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("does not match by title, student, or assignment-student workflow and keeps collections separate", async () => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    fixture.assignments[0].id = "another-task"; fixture.submissions.push({ ...fixture.submissions[0], id: "another-answer" }); fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    expect(review.assignments.counts).toMatchObject({ same: 0, new: 1, currentOnly: 1 });
    expect(review.submissions.counts).toMatchObject({ same: 1, currentOnly: 1 });
    fixture.assignments[0].id = fixture.submissions[0].id; fixture.save();
    const separate = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    expect(new Set([...separate.assignments.differences, ...separate.submissions.differences].map(getBackupDifferenceKey)).size).toBe(3);
  });
  it("retains legacy omissions, empty histories, unknown fields and review-only attempt counters", async () => {
    const fixture = learningBackupFixture(); const old = { ...fixture.assignments[0] };
    Reflect.deleteProperty(old, "subjectId"); Reflect.deleteProperty(old, "groupId"); Reflect.deleteProperty(old, "status"); Reflect.deleteProperty(old, "allowLateSubmissions");
    const legacy = { id: "old", assignmentId: "task-1", studentId: "student-1", studentName: "PRIVATE", sentAt: "2026-10-28T12:00", attempts: [], attemptCount: 3 };
    const review = await compareBackupLearningRecords([{ key: ASSIGNMENTS, raw: JSON.stringify([old]) }, { key: SUBMISSIONS, raw: JSON.stringify([legacy]) }], [{ key: ASSIGNMENTS, raw: JSON.stringify([{ ...old, status: "published", PRIVATE_FIELD: "PRIVATE" }]) }, { key: SUBMISSIONS, raw: JSON.stringify([{ ...legacy, attempts: undefined }]) }]);
    expect(review.assignments.differences[0].fields).toEqual(["status", "other"]); expect(review.submissions.differences[0].fields).toEqual(["attempts"]);
    expect(review.submissions.counts.uncheckedDocuments).toBe(0); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it.each(["assignments", "submissions"] as const)("does not salvage duplicate or partly corrupted %s", async (kind) => {
    const fixture = learningBackupFixture(); const key = kind === "assignments" ? ASSIGNMENTS : SUBMISSIONS;
    const rows = kind === "assignments" ? fixture.assignments : fixture.submissions;
    for (const bad of [[rows[0], rows[0]], [rows[0], null]]) {
      const review = await compareBackupLearningRecords(fixture.archive.localStorage, [{ key, raw: JSON.stringify(bad) }]);
      expect(review[kind].counts).toMatchObject({ uncheckedDocuments: 1, new: 0, currentOnly: 0 }); expect(review[kind].differences).toEqual([]);
    }
  });
  it("rejects duplicate attempt IDs and invalid attempt order without creating a replacement history", async () => {
    const fixture = learningBackupFixture(); fixture.submissions[0].attempts!.push({ ...fixture.submissions[0].attempts![0] }); fixture.save();
    expect((await compareBackupLearningRecords(fixture.archive.localStorage, [])).submissions.uncompared[0].reason).toBe("invalid-document");
    fixture.submissions[0].attempts = [{ ...fixture.submissions[0].attempts![0], number: 2 }]; fixture.save();
    expect((await compareBackupLearningRecords(fixture.archive.localStorage, [])).submissions.uncompared[0].reason).toBe("invalid-document");
  });
  it("distinguishes absent, saved empty, malformed and unsupported source lists", async () => {
    const fixture = learningBackupFixture();
    expect((await compareBackupLearningRecords([], [])).assignments.counts.documents).toBe(0);
    const empty = await compareBackupLearningRecords([{ key: ASSIGNMENTS, raw: "[]" }, { key: SUBMISSIONS, raw: "[]" }], []);
    expect(empty.assignments.counts.comparedDocuments).toBe(1); expect(empty.submissions.counts.comparedDocuments).toBe(1);
    const future = await compareBackupLearningRecords([{ key: `${ASSIGNMENTS}-v2`, raw: "PRIVATE" }], fixture.archive.localStorage);
    expect(future.assignments.uncompared[0].reason).toBe("unsupported-key"); expect(future.assignments.counts.currentOnly).toBe(1);
    const broken = await compareBackupLearningRecords([{ key: SUBMISSIONS, raw: "PRIVATE{broken" }], []);
    expect(broken.submissions.uncompared[0].reason).toBe("invalid-document");
  });
  it("retains all answer differences after 200 and rejects incomplete or cross-collection results", async () => {
    const fixture = learningBackupFixture(); const row = fixture.submissions[0];
    fixture.submissions.splice(0, 1, ...Array.from({ length: 230 }, (_, index) => ({ ...row, id: `answer-${String(index).padStart(3, "0")}` }))); fixture.save();
    const review = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    expect(review.submissions.counts.new).toBe(230); expect(review.submissions.differences.at(-1)?.id).toBe("answer-229"); expect(() => assertCompleteLearningComparison(review)).not.toThrow();
    const wrong = structuredClone(review); Object.assign(wrong.submissions.differences[0].reference!, { collection: "assignments" });
    expect(() => assertCompleteLearningComparison(wrong)).toThrow("неполный отчёт");
    review.submissions.differences.pop(); expect(() => assertCompleteLearningComparison(review)).toThrow("неполный отчёт");
  });
  it("supports cancellation before and during a long comparison without live reads or writes", async () => {
    const fixture = learningBackupFixture(); const controller = new AbortController(); controller.abort();
    await expect(compareBackupLearningRecords(fixture.archive.localStorage, [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    fixture.assignments.splice(0, 1, ...Array.from({ length: 300 }, (_, index) => ({ ...fixture.assignments[0], id: `task-${index}` }))); fixture.save();
    const pending = new AbortController(); setTimeout(() => pending.abort(), 0);
    await expect(compareBackupLearningRecords(fixture.archive.localStorage, [], pending.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
});
