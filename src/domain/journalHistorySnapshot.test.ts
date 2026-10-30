import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JournalChange } from "../data/journalStore";
import type { Student } from "../components/Attendance/data/students";
import { inspectJournalHistorySnapshot } from "./journalHistorySnapshot";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const row = (id = "change", patch: Partial<JournalChange> = {}): JournalChange => ({ id, field: "grade", studentId: "student-1", lessonId: "legacy-lesson",
  previousValue: 4, nextValue: 5, changedAt: "2026-10-30T08:00:00Z", studentName: "PRIVATE NAME", actor: { id: "teacher", name: "PRIVATE ACTOR" }, ...patch });
const student = (grades: Student["grades"] = { "legacy-lesson": 5 }) => ({ id: "student-1", attendance: { "legacy-lesson": "present" as const }, grades });
const forbidden = vi.fn(() => { throw new Error("Snapshot checks must not consult live data or migrate keys"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("latest applicable archived journal changes", () => {
  it("compares literal legacy keys in an immutable snapshot, without a starting baseline or date sorting", async () => {
    const rows = Object.freeze([Object.freeze(row("newest", { changedAt: "2026-10-29T08:00:00Z" })), Object.freeze(row("older", { nextValue: 3 }))]);
    const students = Object.freeze([Object.freeze({ ...student(), grades: Object.freeze(student().grades) })]); const before = JSON.stringify({ rows, students });
    expect(await inspectJournalHistorySnapshot(rows, { status: "readable", students })).toEqual({ issues: [], comparedCells: 1, unresolvedCells: 0 });
    expect(JSON.stringify({ rows, students })).toBe(before);
  });

  it("reports a mismatch at the latest event without exposing identities or values", async () => {
    const review = await inspectJournalHistorySnapshot([row()], { status: "readable", students: [student({ "legacy-lesson": 3 })] });
    expect(review).toMatchObject({ comparedCells: 1, unresolvedCells: 0, issues: [expect.objectContaining({ id: "change", level: "review", code: "journal-history-snapshot-mismatch" })] });
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each([null, 2, 3, 4, 5] as const)("compares explicitly saved grade %s including an empty grade", async (value) => {
    expect(await inspectJournalHistorySnapshot([row("grade", { nextValue: value })], { status: "readable", students: [student({ "legacy-lesson": value })] })).toMatchObject({ issues: [], comparedCells: 1 });
  });

  it.each(["unmarked", "present", "sick", "absent"] as const)("compares explicitly saved attendance %s", async (value) => {
    const students = [{ ...student(), attendance: { "legacy-lesson": value } }];
    expect(await inspectJournalHistorySnapshot([row("attendance", { field: "attendance", previousValue: "sick", nextValue: value })], { status: "readable", students })).toMatchObject({ issues: [], comparedCells: 1 });
  });

  it("never turns a missing student or cell into null/unmarked or a same-day lesson", async () => {
    const rows = [row("grade", { nextValue: null }), row("attendance", { field: "attendance", previousValue: "present", nextValue: "unmarked" }), row("missing-person", { studentId: "old-student" })];
    const review = await inspectJournalHistorySnapshot(rows, { status: "readable", students: [{ id: "student-1", attendance: {}, grades: { "managed-lesson": null } }] });
    expect(review).toMatchObject({ comparedCells: 0, unresolvedCells: 3 });
    expect(review.issues.map((issue) => [issue.id, issue.code])).toEqual(rows.map((change) => [change.id, "missing-journal-snapshot-cell"]));
  });

  it.each(["absent", "invalid"] as const)("summarizes an %s paired journal once, without pretending to compare", async (status) => {
    const review = await inspectJournalHistorySnapshot([row("one"), row("two", { lessonId: "other" })], { status });
    expect(review).toMatchObject({ comparedCells: 0, unresolvedCells: 2, issues: [expect.objectContaining({ code: "unavailable-journal-snapshot" })] });
    expect(review.issues[0].id).toBeUndefined();
    expect(await inspectJournalHistorySnapshot([], { status })).toEqual({ issues: [], comparedCells: 0, unresolvedCells: 0 });
  });

  it.each([
    { field: "roster", previousValue: null, nextValue: "added" },
    { field: "roster", previousValue: "active", nextValue: "removed" },
    { field: "roster", previousValue: "PRIVATE OLD", nextValue: "PRIVATE NEW" },
    { field: "roster", previousValue: 4, nextValue: 5 },
  ] as const)("keeps newer candidates but blocks older cells at any roster boundary: %j", async (patch) => {
    const rows = [row("newer"), row("boundary", { lessonId: undefined, ...patch }), row("older", { lessonId: "missing" }), row("other-person", { studentId: "student-2" })];
    const review = await inspectJournalHistorySnapshot(rows, { status: "readable", students: [student(), { ...student(), id: "student-2" }] });
    expect(review).toEqual({ issues: [], comparedCells: 2, unresolvedCells: 0 });
  });

  it("keeps newer candidates but stops at a demo batch, even with malformed demo values", async () => {
    const rows = [row("newer"), row("demo", { field: "demo", studentId: "demo-import", nextValue: 4 }), row("older", { studentId: "missing" })];
    expect(await inspectJournalHistorySnapshot(rows, { status: "readable", students: [student()] })).toEqual({ issues: [], comparedCells: 1, unresolvedCells: 0 });
  });

  it("blocks older cells only for the affected student's field after an event without a lesson", async () => {
    const rows = [row("newer", { lessonId: "newer-lesson" }), row("unknown", { lessonId: undefined }), row("grade-old"), row("attendance", { field: "attendance", previousValue: "sick", nextValue: "present" }), row("other-person", { studentId: "student-2" })];
    expect(await inspectJournalHistorySnapshot(rows, { status: "readable", students: [student({ "newer-lesson": 5 }), { ...student(), id: "student-2" }] })).toEqual({ issues: [], comparedCells: 3, unresolvedCells: 0 });
  });

  it("does not fall back from an invalid latest transition to an older valid cell", async () => {
    const rows = [row("invalid", { nextValue: "PRIVATE BAD" }), row("older"), row("other", { lessonId: "other" })];
    expect(await inspectJournalHistorySnapshot(rows, { status: "readable", students: [student({ "legacy-lesson": 3, other: 5 })] })).toEqual({ issues: [], comparedCells: 1, unresolvedCells: 0 });
  });

  it("keeps fields and literal student/lesson IDs separate", async () => {
    const rows = [row("one", { studentId: "a:b", lessonId: "c" }), row("two", { studentId: "a", lessonId: "b:c", nextValue: 3 }), row("attendance", { studentId: "a:b", lessonId: "c", field: "attendance", previousValue: "sick", nextValue: "present" })];
    const students: Pick<Student, "id" | "attendance" | "grades">[] = [{ id: "a:b", grades: { c: 5 }, attendance: { c: "present" } }, { id: "a", grades: { "b:c": 3 }, attendance: {} }];
    expect(await inspectJournalHistorySnapshot(rows, { status: "readable", students })).toEqual({ issues: [], comparedCells: 3, unresolvedCells: 0 });
  });

  it("pairs exact archived areas regardless of list order and supports legacy student arrays", async () => {
    const fixture = journalBackupFixture(); const before = JSON.stringify(fixture.archive);
    const entries = fixture.archive.localStorage.map((entry) => ({ ...entry })).reverse(); const otherJournal = { key: `${fixture.journalKey}:other`, raw: JSON.stringify([{ ...fixture.students[0], attendance: { "2026-10-28": "absent" } }]) };
    entries.push(otherJournal); entries.find((entry) => entry.key === fixture.journalKey)!.raw = JSON.stringify(fixture.students);
    const review = await inspectBackupJournals(entries);
    expect(review.issues).toEqual([]); expect(review.checks[1].message).toContain("Сверено последних применимых изменений с ячейками архивных журналов: 1; не удалось сверить: 0");
    expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("does not use a readable subset of a broken journal as a snapshot", async () => {
    const fixture = journalBackupFixture(); fixture.archive.localStorage.find((entry) => entry.key === fixture.journalKey)!.raw = JSON.stringify([fixture.students[0], { id: "broken" }]);
    const review = await inspectBackupJournals(fixture.archive.localStorage);
    expect(review.issues.map((issue) => issue.code)).toEqual(["invalid-journal-document", "unavailable-journal-snapshot"]);
    expect(review.checks[1]).toMatchObject({ status: "valid", records: 1 });
    expect(review.checks[1].message).toContain("Сверено последних применимых изменений с ячейками архивных журналов: 0; не удалось сверить: 1");
  });

  it("retains findings beyond 200 and supports cancellation in both history and snapshot indexing", async () => {
    const rows = Array.from({ length: 300 }, (_, index) => row(`change-${index}`, { lessonId: `lesson-${index}` }));
    const review = await inspectJournalHistorySnapshot(rows, { status: "readable", students: [] });
    expect(review.unresolvedCells).toBe(300); expect(review.issues).toHaveLength(300); expect(review.issues.at(-1)?.id).toBe("change-299");
    for (const [history, students] of [[rows, []], [[row()], Array.from({ length: 300 }, (_, index) => ({ ...student(), id: `student-${index}` }))]] as const) {
      const controller = new AbortController(); const pending = inspectJournalHistorySnapshot(history, { status: "readable", students }, controller.signal); const timer = setTimeout(() => controller.abort(), 0);
      try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    }
  });
});
