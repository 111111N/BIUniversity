import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalChange } from "../data/journalStore";
import { inspectJournalHistoryChain } from "./journalHistoryChain";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const row = (id: string, patch: Partial<JournalChange> = {}): JournalChange => ({
  id, field: "grade", studentId: "student-1", lessonId: "lesson-1", previousValue: 4, nextValue: 5,
  changedAt: "2026-10-30T08:00:00Z", studentName: "PRIVATE STUDENT", actor: { id: "teacher-1", name: "PRIVATE ACTOR" }, ...patch,
});
const forbidden = vi.fn(() => { throw new Error("Chain checks must not infer a baseline from live journals, people or lessons"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("retained journal cell history", () => {
  it("allows an incomplete oldest boundary and never invents a starting empty grade", async () => {
    expect(await inspectJournalHistoryChain([])).toEqual({ issues: [], comparedPairs: 0 });
    const rows = Object.freeze([Object.freeze(row("only", { previousValue: 4, nextValue: 5 }))]);
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 0 }); expect(forbidden).not.toHaveBeenCalled();
  });

  it("compares newest-first neighbours without reordering immutable events by date", async () => {
    const rows = Object.freeze([Object.freeze(row("newer", { changedAt: "2026-10-29T08:00:00Z" })), Object.freeze(row("older", { previousValue: 2, nextValue: 4, changedAt: "2026-10-30T08:00:00Z" }))]);
    const before = JSON.stringify(rows); expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 1 }); expect(JSON.stringify(rows)).toBe(before);
  });

  it("points to the newer disconnected event without exposing either value or historical identity", async () => {
    const rows = [row("newer"), row("older", { previousValue: 2, nextValue: 3 })]; const before = JSON.stringify(rows);
    const review = await inspectJournalHistoryChain(rows);
    expect(review.comparedPairs).toBe(1); expect(review.issues).toEqual([expect.objectContaining({ id: "newer", level: "review", code: "disconnected-journal-history" })]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(rows)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it("keeps students, literal lesson IDs and cell types separate", async () => {
    const rows = [row("a", { studentId: "a:b", lessonId: "c" }), row("b", { studentId: "a", lessonId: "b:c", nextValue: 3 }), row("c", { studentId: "a:b", lessonId: "c", field: "attendance", previousValue: "unmarked", nextValue: "present" })];
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 0 });
  });

  it("handles interleaved grade and attendance changes, including removal of a grade", async () => {
    const rows = [row("g-new", { previousValue: null, nextValue: 5 }), row("a-new", { field: "attendance", previousValue: "sick", nextValue: "present" }), row("g-old", { previousValue: 2, nextValue: null }), row("a-old", { field: "attendance", previousValue: "unmarked", nextValue: "sick" })];
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 2 });
  });

  it("does not let an unassigned lesson bridge other changes of the same student's field", async () => {
    const rows = [row("g-new"), row("a-new", { field: "attendance", previousValue: "sick", nextValue: "present" }), row("unknown", { lessonId: undefined }), row("g-old", { nextValue: 3 }), row("a-old", { field: "attendance", previousValue: "unmarked", nextValue: "sick" })];
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 1 });
  });

  it("breaks only the affected cell at a bad value instead of comparing around the unreadable transition", async () => {
    const rows = [row("one-new"), row("two-new", { lessonId: "lesson-2" }), row("invalid", { nextValue: "PRIVATE INVALID" }), row("one-old", { nextValue: 3 }), row("two-old", { lessonId: "lesson-2", previousValue: 2, nextValue: 4 })];
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 1 });
  });

  it.each([
    { previousValue: null, nextValue: "added" }, { previousValue: "active", nextValue: "removed" }, { previousValue: "PRIVATE OLD NAME", nextValue: "PRIVATE NEW NAME" },
  ] as const)("treats a roster event as a conservative boundary for that student: %j", async (values) => {
    const rows = [row("one-new"), row("two-new", { studentId: "student-2" }), row("roster", { field: "roster", lessonId: undefined, ...values }), row("one-old", { nextValue: 3 }), row("two-old", { studentId: "student-2", previousValue: 2, nextValue: 4 })];
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 1 });
  });

  it("does not bridge a demo event that may have changed multiple cells without separate audit rows", async () => {
    const rows = [row("g-new"), row("a-new", { field: "attendance", previousValue: "sick", nextValue: "present" }), row("demo", { field: "demo", studentId: "demo-import", lessonId: undefined, previousValue: null, nextValue: "PRIVATE SUMMARY" }), row("g-old", { nextValue: 3 }), row("a-old", { field: "attendance", previousValue: "unmarked", nextValue: "absent" })];
    expect(await inspectJournalHistoryChain(rows)).toEqual({ issues: [], comparedPairs: 0 });
  });

  it("continues checking earlier neighbours after a gap without cascading the first mismatch", async () => {
    const review = await inspectJournalHistoryChain([row("newest"), row("middle", { previousValue: 2, nextValue: 3 }), row("oldest", { previousValue: null, nextValue: 2 })]);
    expect(review.comparedPairs).toBe(2); expect(review.issues).toEqual([expect.objectContaining({ id: "newest" })]);
  });

  it("does not join histories across archived teaching areas", async () => {
    const entries = [
      { key: "bi-university-journal-history-v1:subject-1:group-1", raw: JSON.stringify([row("one")]) },
      { key: "bi-university-journal-history-v1:subject-2:group-2", raw: JSON.stringify([row("two", { nextValue: 3 })]) },
    ];
    const review = await inspectBackupJournals(entries);
    expect(review.issues.map((issue) => issue.code)).toEqual(["unavailable-journal-snapshot", "unavailable-journal-snapshot"]);
    expect(review.checks[1].message).toContain("Сопоставлено пар соседних изменений из читаемых списков: 0");
  });

  it("preserves the source journal and reports a gap as review, not as a corrupt history schema", async () => {
    const fixture = journalBackupFixture();
    const actor = fixture.changes[0].actor;
    fixture.changes.splice(0, fixture.changes.length, row("newer", { actor, lessonId: "managed:lesson-1" }), row("older", { actor, lessonId: "managed:lesson-1", previousValue: 2, nextValue: 3 })); fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(review.issues).toEqual([expect.objectContaining({ code: "disconnected-journal-history", kind: "journalHistory", referenceId: fixture.historyKey, recordId: "newer" })]);
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it("does not run chain checks against a readable subset of a structurally broken list", async () => {
    const review = await inspectBackupJournals([{ key: "bi-university-journal-history-v1:s:g", raw: JSON.stringify([row("one"), row("two", { nextValue: 3 }), { id: "broken" }]) }]);
    expect(review.issues).toEqual([expect.objectContaining({ code: "invalid-journal-document" })]); expect(review.checks[1].records).toBeUndefined();
  });

  it("keeps all gap findings beyond 200 and cancels a long single history", async () => {
    const rows = Array.from({ length: 300 }, (_, index) => row(`change-${index}`)); const review = await inspectJournalHistoryChain(rows);
    expect(review.comparedPairs).toBe(299); expect(review.issues).toHaveLength(299); expect(review.issues.at(-1)?.id).toBe("change-298");
    const controller = new AbortController(); const pending = inspectJournalHistoryChain(rows, controller.signal); const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    expect(forbidden).not.toHaveBeenCalled();
  });
});
