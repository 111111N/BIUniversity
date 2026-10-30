import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Archive inspection must not use live stores"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("archived journals and change history", () => {
  it("validates schemas and saved lesson identities as-is, keeping private names out of the report", async () => {
    const state = journalBackupFixture(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toEqual({ valid: 8, invalid: 0, absent: 5, unchecked: 0, errors: 0, reviews: 0 });
    for (const kind of ["journals", "journalHistory"]) expect(review.checks).toContainEqual(expect.objectContaining({ kind, documents: 1, records: 1, status: "valid" }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("accepts the older student array without creating a versioned replacement", async () => {
    const state = journalBackupFixture();
    state.archive.localStorage.find((entry) => entry.key === state.journalKey)!.raw = JSON.stringify(state.students);
    const before = JSON.stringify(state.archive);
    const review = await inspectBackupJournals(state.archive.localStorage);
    expect(review.checks[0]).toMatchObject({ status: "valid", records: 1 }); expect(review.issues).toEqual([]);
    expect(JSON.stringify(state.archive)).toBe(before);
  });

  it("distinguishes empty saved lists from absent areas", async () => {
    const state = journalBackupFixture(); state.students.length = 0; state.changes.length = 0; state.save();
    const empty = await inspectBackupJournals(state.archive.localStorage);
    expect(empty.checks.every((check) => check.status === "valid" && check.records === 0 && check.documents === 1)).toBe(true);
    const absent = await inspectBackupJournals([]);
    expect(absent.checks.every((check) => check.status === "absent" && check.documents === 0 && check.records === undefined)).toBe(true);
  });

  it.each([
    "{broken PRIVATE", "{}", "[null]", '{"version":99,"students":[]}',
    '[{"id":"student","name":"PRIVATE","attendance":{"lesson":["present"]},"grades":{}}]',
    '[{"id":"student","name":"PRIVATE","attendance":{},"grades":{"lesson":"5"}}]',
    '[{"id":"","name":"PRIVATE","attendance":{},"grades":{}}]',
  ])("reports an invalid journal as one complete failed list: %s", async (raw) => {
    const state = journalBackupFixture(); state.archive.localStorage.find((entry) => entry.key === state.journalKey)!.raw = raw;
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 7, invalid: 1, errors: 1, unchecked: 0 });
    expect(review.issues).toContainEqual(expect.objectContaining({ kind: "journals", code: "invalid-journal-document", referenceId: state.journalKey }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each([
    { id: "" }, { changedAt: "wrong" }, { field: "unknown" }, { previousValue: {} },
    { nextValue: [] }, { actor: null }, { actor: { id: "teacher", name: "PRIVATE", role: "unknown" } },
    { actor: { id: "teacher", name: "PRIVATE", memberships: [{ subjectId: "subject", groupIds: [null] }] } },
    { lessonId: 1 }, { studentName: {} },
  ])("does not silently drop damaged history events: %j", async (change) => {
    const state = journalBackupFixture(); Object.assign(state.changes[0], change); state.save();
    const review = await inspectBackupJournals(state.archive.localStorage);
    expect(review.checks[1]).toMatchObject({ status: "invalid", documents: 1 });
    expect(review.checks[1]).not.toHaveProperty("records");
    expect(review.issues).toContainEqual(expect.objectContaining({ kind: "journalHistory", referenceId: state.historyKey, code: "invalid-journal-document" }));
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("rejects duplicates within each list without deduplicating source history", async () => {
    const state = journalBackupFixture(); state.students.push({ ...state.students[0] }); state.changes.push({ ...state.changes[0] }); state.save();
    const before = JSON.stringify(state.archive);
    const review = await inspectBackupJournals(state.archive.localStorage);
    expect(review.checks.every((check) => check.status === "invalid")).toBe(true); expect(review.issues).toHaveLength(2);
    expect(JSON.stringify(state.archive)).toBe(before);
  });
  it("reports a partially damaged history list without treating its valid subset as complete", async () => {
    const state = journalBackupFixture();
    state.archive.localStorage.find((entry) => entry.key === state.historyKey)!.raw = JSON.stringify([state.changes[0], { id: "broken", studentName: "PRIVATE BROKEN EVENT" }]);
    const before = JSON.stringify(state.archive);
    const review = await inspectBackupJournals(state.archive.localStorage);
    expect(review.checks[1]).toMatchObject({ status: "invalid", documents: 1 });
    expect(review.checks[1]).not.toHaveProperty("records");
    expect(review.issues).toHaveLength(1); expect(JSON.stringify(review)).not.toContain("PRIVATE");
    expect(JSON.stringify(state.archive)).toBe(before);
  });

  it("keeps damaged lists visible while checking other lists in the same area", async () => {
    const state = journalBackupFixture();
    state.archive.localStorage.push({ key: `${state.journalKey}-other`, raw: "[null]" });
    const review = await inspectBackupJournals(state.archive.localStorage);
    expect(review.checks[0]).toMatchObject({ status: "invalid", documents: 2 });
    expect(review.checks[0].message).toContain("прочитано: 1; не читается: 1");
    expect(review.checks[0]).not.toHaveProperty("records");
    expect(review.checks[1]).toMatchObject({ status: "valid", records: 1 });
  });

  it("accepts historical roster/demo events and optional author details without consulting current accounts", async () => {
    const state = journalBackupFixture();
    state.changes[0].actor = { id: "old-teacher", name: "PRIVATE OLD ACTOR" };
    state.changes[0].field = "demo"; state.changes[0].studentId = "demo-import"; delete state.changes[0].lessonId;
    state.changes[0].previousValue = null;
    state.changes[0].nextValue = "PRIVATE DEMONSTRATION DESCRIPTION"; state.save();
    const review = await inspectBackupJournals(state.archive.localStorage);
    expect(review.issues).toEqual([]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("groups hundreds of lists into two summaries without adding hundreds of UI sections", async () => {
    const entries = Array.from({ length: 250 }, (_, index) => ({ key: `bi-university-journal-v1:subject-${index}:group-${index}`, raw: "[]" }));
    const review = await inspectBackupJournals(entries);
    expect(review.checks).toHaveLength(2); expect(review.checks[0]).toMatchObject({ documents: 250, records: 0, status: "valid" });
    expect(review.issues).toEqual([]);
  });

  it("recognizes history before the overlapping journal prefix and reports future keys separately", async () => {
    const review = await inspectBackupJournals([
      { key: "bi-university-journal-v2:subject:group", raw: "[]" },
      { key: "bi-university-journal-history-v2:subject:group", raw: "[]" },
    ]);
    expect(review.issues.map((issue) => issue.kind)).toEqual(["journals", "journalHistory"]);
    expect(review.issues.every((issue) => issue.code === "unsupported-journal-key")).toBe(true);
  });

  it("propagates cancellation between batches without returning a partial review", async () => {
    const controller = new AbortController();
    const entries = Array.from({ length: 260 }, (_, index) => ({ key: `bi-university-journal-v1:subject:group-${index}`, raw: "[]" }));
    const promise = inspectBackupJournals(entries, controller.signal); controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
