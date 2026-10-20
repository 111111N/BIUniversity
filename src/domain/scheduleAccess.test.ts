import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../components/RoleContext";
import { getDemoWeekSchedule } from "../data/schedule";
import { canOpenScheduleLesson } from "./scheduleAccess";

const item = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
const memberships = [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }];
const teacher: CurrentUser = { id: "teacher-elena-volkova", name: "Елена Волкова", scheduleName: "Волкова Е.В.", role: "teacher", memberships };
const student: CurrentUser = { id: "anna-smirnova", name: "Анна Смирнова", role: "student", memberships };

describe("schedule lesson access", () => {
  it("allows students to open their group's lessons with any teacher", () => {
    expect(canOpenScheduleLesson(item, student)).toBe(true);
    expect(canOpenScheduleLesson({ ...item, teacher: "Петров П.П.", teacherId: "teacher-pavel-petrov" }, student)).toBe(true);
  });
  it("denies other groups and subjects even when visible in schedule search", () => {
    expect(canOpenScheduleLesson({ ...item, group: "113-МКо" }, student)).toBe(false);
    expect(canOpenScheduleLesson({ ...item, subject: "Анализ данных" }, student)).toBe(false);
    expect(canOpenScheduleLesson({ ...item, group: undefined }, student)).toBe(false);
  });
  it("allows teachers only their own lessons in an assigned journal", () => {
    expect(canOpenScheduleLesson(item, teacher)).toBe(true);
    expect(canOpenScheduleLesson({ ...item, teacher: "Петров П.П.", teacherId: "teacher-pavel-petrov" }, teacher)).toBe(false);
    expect(canOpenScheduleLesson({ ...item, group: "113-МКо" }, teacher)).toBe(false);
  });
  it("gives teacher IDs priority over a matching displayed name", () => {
    expect(canOpenScheduleLesson({ ...item, teacherId: "different-teacher" }, teacher)).toBe(false);
    expect(canOpenScheduleLesson({ ...item, teacher: "Изменённое имя" }, teacher)).toBe(true);
  });
  it("supports legacy exact names without granting access to unknown teachers", () => {
    expect(canOpenScheduleLesson({ ...item, teacherId: undefined }, teacher)).toBe(true);
    expect(canOpenScheduleLesson({ ...item, teacherId: undefined, teacher: "Петров П.П." }, teacher)).toBe(false);
    expect(canOpenScheduleLesson({ ...item, teacherId: undefined, teacher: undefined }, teacher)).toBe(false);
    expect(canOpenScheduleLesson({ ...item, teacherId: undefined }, { ...teacher, scheduleName: undefined })).toBe(false);
  });
});
