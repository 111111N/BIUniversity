import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedScheduleConflicts } from "./backupScheduleConflicts";
import { createEmptyManagedSchedule, findScheduleConflicts, type ManagedLesson, type ManagedScheduleSnapshot } from "./scheduleManagement";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { coreBackupFixture, scheduleConflictBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Conflict inspection must not access browser stores or built-in lessons"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const lesson = (values: Partial<ManagedLesson> = {}): ManagedLesson => ({ id: "managed:first", scheduleId: 1, subjectId: "subject-1", groupId: "group-1", teacherId: "teacher-1", teacherName: "PRIVATE TEACHER", date: "2026-10-28", startsAt: "09:00", endsAt: "10:30", type: "practice", room: "101", ...values });
const other = (values: Partial<ManagedLesson> = {}) => lesson({ id: "managed:second", scheduleId: 2, startsAt: "10:00", endsAt: "11:30", ...values });
const snapshot = (published: ManagedLesson[] = [], drafts: ManagedLesson[] = []): ManagedScheduleSnapshot => {
  const weeks = (rows: ManagedLesson[]) => [...new Set(rows.map((row) => row.groupId))].map((groupId) => ({ weekStart: "2026-10-26", groupId, lessons: rows.filter((row) => row.groupId === groupId) }));
  return { ...createEmptyManagedSchedule(), published: weeks(published), drafts: weeks(drafts), journal: published.map((row) => ({ ...row, journalState: "active" })) };
};

describe("archived schedule conflicts", () => {
  it("reports each published conflict by type with technical IDs and preserves readable schema and source", async () => {
    const state = scheduleConflictBackupFixture(); const before = JSON.stringify(state.archive);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 4, invalid: 0, errors: 3, reviews: 0 });
    expect(result.issues.map((issue) => issue.code)).toEqual(["published-schedule-conflict-teacher", "published-schedule-conflict-group", "published-schedule-conflict-room"]);
    expect(result.issues.every((issue) => issue.referenceId === BACKUP_CORE_DOCUMENTS.schedule.key && issue.recordId === JSON.stringify(["published", "managed:lesson-1", "managed:lesson-2"]))).toBe(true);
    const check = result.checks.find((item) => item.kind === "schedule")!;
    expect(check.status).toBe("valid"); expect(check.message).toContain("Проверено опубликованных пар: 2; пар черновиков: 0");
    expect(check.message).toContain("Пересечений в публикации: 3; внутри черновиков: 0");
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before);
  });

  it.each([
    ["teacher", { groupId: "group-2", room: "202" }],
    ["group", { teacherId: "teacher-2", room: "202" }],
    ["room", { teacherId: "teacher-2", groupId: "group-2", room: "Ауд. 1 01" }],
  ] as const)("matches the publication conflict rule for %s", async (kind, values) => {
    const first = lesson(); const second = other(values);
    expect(findScheduleConflicts([first, second]).map((issue) => issue.kind)).toEqual([kind]);
    const result = await inspectArchivedScheduleConflicts(snapshot([first, second]));
    expect(result.issues.map((issue) => issue.code)).toEqual([`published-schedule-conflict-${kind}`]);
  });

  it.each([
    { startsAt: "10:30", endsAt: "12:00" },
    { startsAt: "07:30", endsAt: "09:00" },
    { date: "2026-10-29" },
    { groupId: "group-2", teacherId: "teacher-2", room: "101а" },
  ])("allows adjacency, different dates and different resources: %j", async (values) => {
    expect((await inspectArchivedScheduleConflicts(snapshot([lesson(), other(values)]))).issues).toEqual([]);
  });

  it("detects containment and identical times without duplicate unordered pairs", async () => {
    for (const values of [{ startsAt: "09:15", endsAt: "09:30" }, { startsAt: "09:00", endsAt: "10:30" }]) {
      const result = await inspectArchivedScheduleConflicts(snapshot([other(values), lesson()]));
      expect(result.issues).toHaveLength(3);
      expect(result.issues.every((issue) => issue.recordId === JSON.stringify(["published", "managed:first", "managed:second"]))).toBe(true);
    }
  });

  it("treats internal draft conflicts as review and never marks the draft schema invalid", async () => {
    const state = coreBackupFixture(); state.schedule.drafts[0].lessons.push({ ...state.schedule.drafts[0].lessons[0], id: "managed:second", scheduleId: 2 }); state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 4, invalid: 0, errors: 0, reviews: 3 });
    expect(result.issues.every((issue) => issue.code.startsWith("draft-schedule-conflict-") && issue.level === "review")).toBe(true);
  });

  it("does not compare a draft with any published lessons of its own group", async () => {
    const first = lesson();
    expect((await inspectArchivedScheduleConflicts(snapshot([first], [{ ...first }]))).issues).toEqual([]);
    expect((await inspectArchivedScheduleConflicts(snapshot([first], [other()]))).issues).toEqual([]);
    expect((await inspectArchivedScheduleConflicts(snapshot([first], []))).issues).toEqual([]);
  });

  it("compares a draft only with the current publication of other groups and keeps the draft ID first", async () => {
    for (const startsAt of ["08:45", "09:15"]) {
      const draft = other({ id: "managed:aaa-draft", groupId: "group-2", startsAt });
      const result = await inspectArchivedScheduleConflicts(snapshot([lesson()], [draft]));
      expect(result.issues.map((issue) => issue.code)).toEqual(["draft-published-schedule-conflict-teacher", "draft-published-schedule-conflict-room"]);
      expect(result.issues.every((issue) => issue.level === "review" && issue.recordId === JSON.stringify(["draft-published", draft.id, "managed:first"]))).toBe(true);
    }
  });

  it("does not combine provisional drafts of different groups or hide an existing publication behind a draft", async () => {
    const first = lesson(); const draft = other({ groupId: "group-2" });
    expect((await inspectArchivedScheduleConflicts(snapshot([], [first, draft]))).issues).toEqual([]);
    const moved = { ...first, startsAt: "14:00", endsAt: "15:30" };
    const result = await inspectArchivedScheduleConflicts(snapshot([first], [moved, draft]));
    expect(result.issues).toHaveLength(2); expect(result.issues.every((issue) => issue.code.startsWith("draft-published-"))).toBe(true);
  });

  it("does not duplicate published conflicts through active history and ignores cancelled or rescheduled history", async () => {
    const state = snapshot([lesson(), other()]);
    state.journal.push({ ...other({ id: "managed:cancelled" }), journalState: "cancelled" }, { ...other({ id: "managed:rescheduled" }), journalState: "rescheduled" });
    expect((await inspectArchivedScheduleConflicts(state)).issues).toHaveLength(3);
    state.published.length = 0; expect((await inspectArchivedScheduleConflicts(state)).issues).toEqual([]);
  });

  it("matches the existing pair rule over an unsorted mix of times, days and resources", async () => {
    const rows = Array.from({ length: 35 }, (_, index) => lesson({ id: `managed:${index}`, scheduleId: index + 1, groupId: `group-${index % 4}`, teacherId: `teacher-${index % 5}`, room: index % 2 ? "Ауд. 101" : "202", date: index % 3 ? "2026-10-28" : "2026-10-29", startsAt: `${String(8 + index % 4).padStart(2, "0")}:00`, endsAt: `${String(9 + index % 4).padStart(2, "0")}:30` }));
    const expected = findScheduleConflicts(rows).map((issue) => JSON.stringify([issue.kind, ...[issue.lessonId, issue.otherId].sort()])).sort();
    const actual = (await inspectArchivedScheduleConflicts(snapshot(rows))).issues.map((issue) => JSON.stringify([issue.code.slice("published-schedule-conflict-".length), ...JSON.parse(issue.recordId!).slice(1)])).sort();
    expect(actual).toEqual(expected);
  });

  it("distinguishes an absent or unreadable schedule from a saved empty schedule", async () => {
    const absent = await inspectArchivedScheduleConflicts(undefined); expect(absent.issues).toEqual([]); expect(absent.summary).toContain("Пересечения пар не проверены");
    const empty = await inspectArchivedScheduleConflicts(createEmptyManagedSchedule()); expect(empty.issues).toEqual([]); expect(empty.summary).toContain("Проверено опубликованных пар: 0; пар черновиков: 0");
    const state = coreBackupFixture(); state.archive.localStorage.find((entry) => entry.key === BACKUP_CORE_DOCUMENTS.schedule.key)!.raw = "{}";
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks.find((check) => check.kind === "schedule")).toMatchObject({ status: "invalid", message: expect.stringContaining("Пересечения пар не проверены") });
  });

  it("does not require current catalogs or account roles to inspect saved pair geometry", async () => {
    const state = scheduleConflictBackupFixture();
    state.archive.localStorage = state.archive.localStorage.filter((entry) => entry.key === BACKUP_CORE_DOCUMENTS.schedule.key);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.issues.filter((issue) => issue.code.startsWith("published-schedule-conflict-"))).toHaveLength(3);
  });

  it("retains every conflict after 200 and supports cancellation while comparing a dense bucket", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => lesson({ id: `managed:${index}`, scheduleId: index + 1 }));
    const result = await inspectArchivedScheduleConflicts(snapshot(rows));
    expect(result.issues).toHaveLength(900); expect(result.summary).toContain("Пересечений в публикации: 900");
    const controller = new AbortController(); const pending = inspectArchivedScheduleConflicts(snapshot(rows), controller.signal);
    setTimeout(() => controller.abort(), 1); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const stopped = new AbortController(); stopped.abort(); await expect(inspectArchivedScheduleConflicts(undefined, stopped.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
