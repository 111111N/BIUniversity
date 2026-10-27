import { describe, expect, it } from "vitest";
import { resolveScheduleEditingScope, restoreRemovedScheduleLesson, validateLessonEditor } from "./scheduleEditing";
import { getManagedLessonIssues, validateManagedLesson, type ManagedLesson } from "./scheduleManagement";

const groups = [{ id: "archived", status: "archived" as const }, { id: "active" }];
const today = "2026-10-27";
const lesson: ManagedLesson = { id: "managed:one", scheduleId: 101, groupId: "active", subjectId: "math", teacherId: "teacher", teacherName: "Преподаватель", date: "2026-10-27", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "305" };
const teachers = [{ id: "teacher", memberships: [{ subjectId: "math", groupIds: ["active"] }] }];
describe("schedule editing scope", () => {
  it("uses defaults only when parameters are absent", () => {
    expect(resolveScheduleEditingScope(null, null, groups, today)).toMatchObject({ valid: true, groupId: "active", weekStart: "2026-10-26" });
    expect(resolveScheduleEditingScope("", null, groups, today)).toMatchObject({ valid: false, groupId: "" });
    expect(resolveScheduleEditingScope(null, "", groups, today)).toMatchObject({ valid: false, weekStart: "" });
  });
  it("never substitutes another group or current week for an explicitly invalid link", () => {
    const result = resolveScheduleEditingScope("missing", "2026-02-30", groups, today);
    expect(result).toMatchObject({ valid: false, groupId: "", weekStart: "" });
    expect(result.errors.group).toBeTruthy(); expect(result.errors.date).toBeTruthy();
    expect(resolveScheduleEditingScope("missing", "2026-09-15", groups, today).weekStart).toBe("2026-09-14");
  });
  it("allows archived groups for viewing and normalizes a real day to its week", () => {
    expect(resolveScheduleEditingScope("archived", "2026-10-25", groups, today)).toMatchObject({ valid: true, groupId: "archived", weekStart: "2026-10-19" });
    expect(resolveScheduleEditingScope(null, null, [groups[0]], today).groupId).toBe("archived");
  });
  it("handles an empty catalog without crashing or fabricating a group", () => {
    expect(resolveScheduleEditingScope(null, null, [], today)).toMatchObject({ valid: false, groupId: "", weekStart: "2026-10-26" });
  });
});
describe("lesson editor validation", () => {
  it("accepts assigned teachers and a valid lesson without changing input", () => {
    const before = structuredClone(lesson);
    expect(validateLessonEditor(lesson, "2026-10-26", teachers)).toEqual({});
    expect(lesson).toEqual(before);
  });
  it("places errors on date, time, room and teacher controls", () => {
    const errors = validateLessonEditor({ ...lesson, date: "2026-11-01", startsAt: "11:00", endsAt: "10:00", room: "", teacherId: "" }, "2026-10-26", teachers);
    expect(errors.date).toBeTruthy(); expect(errors.endsAt).toBeTruthy(); expect(errors.room).toBeTruthy(); expect(errors.teacherId).toBeTruthy();
    expect(validateLessonEditor({ ...lesson, startsAt: "" }, "2026-10-26", teachers).startsAt).toBeTruthy();
  });
  it("rejects a date outside the chosen week and an unassigned teacher", () => {
    expect(validateLessonEditor({ ...lesson, date: "2026-11-02" }, "2026-10-26", teachers).date).toContain("открытой недели");
    expect(validateLessonEditor(lesson, "2026-10-26", [{ id: "teacher", memberships: [{ subjectId: "other", groupIds: ["active"] }] }]).teacherId).toContain("не назначен");
  });
  it("shares domain rules while exposing identity faults as a form error", () => {
    const invalid = { ...lesson, subjectId: "", room: "x".repeat(101), id: "bad" };
    expect(validateManagedLesson(invalid)).toEqual(getManagedLessonIssues(invalid).map((issue) => issue.message));
    expect(validateLessonEditor(invalid, "2026-10-26", teachers)).toMatchObject({ subjectId: expect.any(String), room: expect.any(String), form: expect.any(String) });
  });
});
describe("undo removal from working week", () => {
  it("restores the same identity without overwriting other edits", () => {
    const current = [{ ...lesson, id: "managed:other", scheduleId: 102, date: "2026-10-28", room: "Edited room" }];
    const before = structuredClone(current);
    const result = restoreRemovedScheduleLesson(current, lesson);
    expect(result.map((entry) => entry.id)).toEqual([lesson.id, "managed:other"]);
    expect(result[1].room).toBe("Edited room"); expect(result[0].scheduleId).toBe(lesson.scheduleId); expect(current).toEqual(before);
    result[0].room = "Changed copy"; expect(lesson.room).toBe("305");
  });
  it("rejects string and numeric identity collisions without altering the working week", () => {
    expect(() => restoreRemovedScheduleLesson([lesson], lesson)).toThrow("Список не изменён");
    expect(() => restoreRemovedScheduleLesson([{ ...lesson, id: "managed:other" }], lesson)).toThrow("Список не изменён");
  });
});
