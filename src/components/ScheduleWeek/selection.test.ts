import { describe, expect, it } from "vitest";
import { currentScheduleSelection, scheduleWorkspaceKey } from "./selection";
import { getDemoWeekSchedule } from "../../data/schedule";
import { canOpenScheduleLesson } from "../../domain/scheduleAccess";
import type { CurrentUser } from "../../domain/accounts";

const week = new Date(2026, 9, 26);
const lesson = getDemoWeekSchedule(week)[0];
const user: CurrentUser = { id: "teacher-elena-volkova", name: "Елена Волкова", role: "teacher", scheduleName: "Волкова Е.В.", memberships: [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }] };
const scopeKey = scheduleWorkspaceKey(week, user);
const resolve = (lessons: Parameters<typeof currentScheduleSelection>[0], id: number | null) =>
  currentScheduleSelection(lessons, id === null ? null : { id, scopeKey }, scopeKey);

describe("schedule selection during refresh", () => {
  it("keeps the selected ID through replacement arrays and returns the current object without copying the source", () => {
    const refreshed = [{ ...lesson }, { ...lesson, id: lesson.id + 100 }]; const before = JSON.stringify(refreshed);
    expect(resolve(refreshed, lesson.id)).toBe(refreshed[0]);
    expect(resolve(refreshed, lesson.id)).not.toBe(lesson);
    expect(JSON.stringify(refreshed)).toBe(before);
  });

  it("uses changed room, time and teacher immediately instead of the captured lesson", () => {
    const updated = { ...lesson, location: "Ауд. 999", startTime: "11:00", endTime: "11:15", teacher: "Другой П.П.", teacherId: "other-teacher" };
    const selected = resolve([updated], lesson.id);
    expect(selected).toBe(updated); expect(canOpenScheduleLesson(lesson, user)).toBe(true);
    expect(canOpenScheduleLesson(selected!, user)).toBe(false);
  });

  it("rechecks the current group and subject instead of preserving old academic access", () => {
    for (const updated of [{ ...lesson, group: "113-МКо" }, { ...lesson, subject: "Другая дисциплина" }]) {
      const selected = resolve([updated], lesson.id);
      expect(canOpenScheduleLesson(selected!, user)).toBe(false);
    }
  });

  it("does not substitute another visible lesson when the selected one disappears", () => {
    expect(resolve([{ ...lesson, id: lesson.id + 1 }], lesson.id)).toBeNull();
    expect(resolve([], lesson.id)).toBeNull();
    expect(resolve([lesson], null)).toBeNull();
  });

  it("does not choose between duplicate IDs even if the lessons have identical public fields", () => {
    expect(resolve([lesson, { ...lesson }], lesson.id)).toBeNull();
    expect(resolve([lesson, { ...lesson, location: "Ауд. 999" }], lesson.id)).toBeNull();
  });

  it("does not treat numeric zero as an absent selection", () => {
    const zero = { ...lesson, id: 0 };
    expect(resolve([zero], 0)).toBe(zero);
  });

  it("never shows the previous scope's lesson during a week, account or search transition, even with the same ID", () => {
    for (const next of [scheduleWorkspaceKey(new Date(2026, 10, 2), user), scheduleWorkspaceKey(week, { ...user, id: "other" }), scheduleWorkspaceKey(week, user, "searched-group")]) {
      expect(currentScheduleSelection([lesson], { id: lesson.id, scopeKey }, next)).toBeNull();
    }
  });
});

describe("schedule workspace identity", () => {
  it("stays stable for dates within the same teaching week and non-identity account updates", () => {
    expect(scheduleWorkspaceKey(new Date(2026, 9, 31), { ...user, id: user.id })).toBe(scheduleWorkspaceKey(week, user));
    expect(scheduleWorkspaceKey(week, { id: user.id, role: user.role })).toBe(scheduleWorkspaceKey(week, user));
  });

  it("resets context across week and year boundaries, role changes and account switches", () => {
    const current = scheduleWorkspaceKey(week, user);
    expect(scheduleWorkspaceKey(new Date(2026, 10, 2), user)).not.toBe(current);
    expect(scheduleWorkspaceKey(new Date(2027, 9, 26), user)).not.toBe(current);
    expect(scheduleWorkspaceKey(week, { ...user, id: "another-account" })).not.toBe(current);
    expect(scheduleWorkspaceKey(week, { ...user, role: "student" })).not.toBe(current);
  });

  it("separates personal and searched schedules even when their result arrays happen to match", () => {
    const personal = JSON.stringify(["personal"]), group = JSON.stringify(["group", "112-МКо"]), teacher = JSON.stringify(["teacher", "112-МКо"]);
    expect(scheduleWorkspaceKey(week, user, personal)).not.toBe(scheduleWorkspaceKey(week, user, group));
    expect(scheduleWorkspaceKey(week, user, group)).not.toBe(scheduleWorkspaceKey(week, user, teacher));
    expect(scheduleWorkspaceKey(week, user, group)).not.toBe(scheduleWorkspaceKey(week, user, JSON.stringify(["group", "113-МКо"])));
  });

  it("does not conflate context values containing delimiters with a different account ID", () => {
    expect(scheduleWorkspaceKey(week, { ...user, id: "account:group" }, "value")).not.toBe(scheduleWorkspaceKey(week, { ...user, id: "account" }, "group:value"));
  });
});
