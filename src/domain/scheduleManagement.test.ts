import { describe, expect, it } from "vitest";
import { createEmptyManagedSchedule, decodeManagedSchedule, findScheduleConflicts, getManagedWeekKey, reconcilePublishedJournal, snapshotHasFutureTeaching, validateManagedLesson, type ManagedLesson } from "./scheduleManagement";

const lesson: ManagedLesson = { id: "managed:first", scheduleId: 100, groupId: "112-mko", subjectId: "theory-of-probability", teacherId: "teacher", teacherName: "Преподаватель", date: "2026-10-19", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "305" };
describe("schedule management rules", () => {
  it("validates real dates, Monday–Saturday and nonempty forward time", () => {
    expect(validateManagedLesson(lesson)).toEqual([]);
    expect(validateManagedLesson({ ...lesson, date: "2026-10-25" })).not.toEqual([]);
    expect(validateManagedLesson({ ...lesson, date: "2026-02-30" })).not.toEqual([]);
    expect(validateManagedLesson({ ...lesson, endsAt: "09:00" })).not.toEqual([]);
    expect(validateManagedLesson({ ...lesson, startsAt: "24:00" })).not.toEqual([]);
    expect(getManagedWeekKey("2026-10-24")).toBe("2026-10-19");
  });
  it("finds cross-group teacher and normalized room conflicts but permits adjacent lessons", () => {
    const other = { ...lesson, id: "managed:other", scheduleId: 101, groupId: "another", startsAt: "10:00", room: "Ауд. 305" };
    expect(findScheduleConflicts([lesson], [other]).map((conflict) => conflict.kind)).toEqual(["teacher", "room"]);
    expect(findScheduleConflicts([lesson], [{ ...other, startsAt: "10:30", endsAt: "12:00" }])).toEqual([]);
    expect(findScheduleConflicts([lesson], [{ ...other, date: "2026-10-20" }])).toEqual([]);
    expect(findScheduleConflicts([lesson, { ...other, groupId: lesson.groupId }]).map((conflict) => conflict.kind)).toContain("group");
  });
  it("retains identities on date edits and archives removals or subject transfers", () => {
    const initial = reconcilePublishedJournal([], [], [lesson]);
    const moved = reconcilePublishedJournal(initial, [lesson], [{ ...lesson, date: "2026-10-20" }]);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ id: lesson.id, scheduleId: 100, date: "2026-10-20", journalState: "active" });
    const transferred = reconcilePublishedJournal(moved, [moved[0]], [{ ...lesson, subjectId: "other-subject" }]);
    expect(transferred.find((entry) => entry.subjectId === lesson.subjectId)?.journalState).toBe("rescheduled");
    expect(transferred.find((entry) => entry.subjectId === "other-subject")?.journalState).toBe("active");
    const removed = reconcilePublishedJournal(moved, [moved[0]], []);
    expect(removed[0]).toMatchObject({ id: lesson.id, journalState: "cancelled" });
  });
  it("decodes structurally valid historical records independently of a changing catalog", () => {
    const snapshot = { ...createEmptyManagedSchedule(), journal: [{ ...lesson, subjectId: "retired-subject", groupId: "retired-group", journalState: "cancelled" }] };
    expect(decodeManagedSchedule(JSON.stringify(snapshot))).not.toBeNull();
    expect(decodeManagedSchedule("broken")).toBeNull();
    expect(decodeManagedSchedule(JSON.stringify({ ...snapshot, version: 9 }))).toBeNull();
    expect(decodeManagedSchedule(JSON.stringify({ ...snapshot, journal: [snapshot.journal[0], snapshot.journal[0]] }))).toBeNull();
    expect(decodeManagedSchedule(JSON.stringify({ ...snapshot, drafts: [{ weekStart: "2026-10-19", groupId: lesson.groupId, lessons: [lesson, lesson] }] }))).toBeNull();
  });
  it("protects future teaching assignments through the actual end time", () => {
    const snapshot = { ...createEmptyManagedSchedule(), published: [{ weekStart: "2026-10-19", groupId: lesson.groupId, lessons: [lesson] }] };
    expect(snapshotHasFutureTeaching(snapshot, "teacher", new Date("2026-10-19T10:29"))).toBe(true);
    expect(snapshotHasFutureTeaching(snapshot, "teacher", new Date("2026-10-19T10:30"))).toBe(false);
    expect(snapshotHasFutureTeaching(snapshot, "other", new Date("2026-10-19T09:00"))).toBe(false);
  });
});
