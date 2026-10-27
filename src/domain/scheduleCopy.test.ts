import { describe, expect, it } from "vitest";
import { copyScheduleWeek, sameScheduleCopyVersions, type ScheduleCopyRequest } from "./scheduleCopy";
import { createEmptyManagedSchedule, type ManagedLesson, type ManagedScheduleSnapshot } from "./scheduleManagement";

const lesson: ManagedLesson = { id: "managed:original", scheduleId: 100, groupId: "112-mko", subjectId: "theory-of-probability", teacherId: "teacher", teacherName: "Преподаватель", date: "2026-10-19", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "305" };
const source = { groupId: lesson.groupId, weekStart: "2026-10-19", lessons: [lesson, { ...lesson, id: "managed:saturday", scheduleId: 101, date: "2026-10-24", type: "laboratory" as const }] };
const snapshot = (): ManagedScheduleSnapshot => ({ ...createEmptyManagedSchedule(), drafts: [structuredClone(source)] });
const request: ScheduleCopyRequest = { groupId: lesson.groupId, source: "draft", sourceWeekStart: source.weekStart, targetWeekStart: "2026-10-26" };
const read = (patch: Partial<ScheduleCopyRequest> = {}, state = snapshot()) => { let counter = 1000; return copyScheduleWeek(state, { ...request, ...patch }, () => ({ id: `managed:copy-${++counter}`, scheduleId: counter })); };

describe("schedule week copying", () => {
  it("moves Monday and Saturday by calendar days, creates new identities and preserves content", () => {
    const state = snapshot(); const before = structuredClone(state);
    const copied = read({}, state);
    expect(copied.map((entry) => entry.date)).toEqual(["2026-10-26", "2026-10-31"]);
    expect(copied[0]).toMatchObject({ id: "managed:copy-1001", scheduleId: 1001, room: "305", startsAt: "09:00", teacherId: lesson.teacherId, groupId: lesson.groupId, type: "lecture" });
    expect(copied[1].type).toBe("laboratory"); expect(state).toEqual(before);
    copied[0].room = "New room"; expect(state.drafts[0].lessons[0].room).toBe("305");
  });
  it("keeps weekdays across year boundaries, leap day and large date shifts", () => {
    expect(read({ targetWeekStart: "2027-01-04" }).map((entry) => entry.date)).toEqual(["2027-01-04", "2027-01-09"]);
    expect(read({ targetWeekStart: "2028-02-28" }).map((entry) => entry.date)).toEqual(["2028-02-28", "2028-03-04"]);
    expect(read({ targetWeekStart: "2026-03-23" }).map((entry) => entry.date)).toEqual(["2026-03-23", "2026-03-28"]);
  });
  it("uses exactly the selected source and never falls back from a missing draft to publication", () => {
    const state = { ...snapshot(), published: [{ ...structuredClone(source), lessons: [{ ...lesson, room: "999" }] }] };
    expect(read({ source: "published" }, state)[0].room).toBe("999");
    expect(read({}, state)[0].room).toBe("305");
    state.drafts = [];
    expect(() => read({}, state)).toThrow("не найдена");
    expect(() => read({ groupId: "other-group", source: "published" }, state)).toThrow("не найдена");
  });
  it("rejects the same week, invalid Mondays and empty or corrupt sources", () => {
    expect(() => read({ targetWeekStart: source.weekStart })).toThrow("другую");
    expect(() => read({ targetWeekStart: "2026-10-27" })).toThrow("понедельника");
    expect(() => read({ targetWeekStart: "2026-02-30" })).toThrow("понедельника");
    const state = snapshot(); state.drafts[0].lessons = [];
    expect(() => read({}, state)).toThrow("нет занятий");
    state.drafts[0].lessons = [{ ...lesson, date: "2026-10-25" }];
    expect(() => read({}, state)).toThrow("некорректное");
  });
  it("rejects collisions with cancelled journal records and duplicates inside the copy", () => {
    const state = snapshot(); state.journal = [{ ...lesson, id: "managed:copy-1001", scheduleId: 700, journalState: "cancelled" }];
    expect(() => read({}, state)).toThrow("идентификаторы");
    state.journal = [{ ...lesson, id: "managed:cancelled", scheduleId: 1001, journalState: "cancelled" }];
    expect(() => read({}, state)).toThrow("идентификаторы");
    expect(() => copyScheduleWeek(snapshot(), request, () => ({ id: "managed:same", scheduleId: 999 }))).toThrow("идентификаторы");
    expect(() => copyScheduleWeek(snapshot(), request, () => ({ id: "managed:fresh", scheduleId: Number.MAX_SAFE_INTEGER + 1 }))).toThrow("идентификаторы");
  });
  it("checks every source version", () => {
    const versions = { scheduleRevision: 1, accountsRevision: 2, subjectRevision: 3, groupRevision: 4 };
    expect(sameScheduleCopyVersions(versions, { ...versions })).toBe(true);
    for (const field of Object.keys(versions) as (keyof typeof versions)[]) expect(sameScheduleCopyVersions(versions, { ...versions, [field]: 99 })).toBe(false);
  });
});
