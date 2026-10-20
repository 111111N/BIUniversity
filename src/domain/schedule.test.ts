import { describe, expect, it } from "vitest";
import { getLessonStatus, getWeekStart, hasTimeOverlap, toLocalDateKey } from "./schedule";
import { DEMO_TEACHER, getDemoWeekSchedule, getPersonalSchedule } from "../data/schedule";

describe("schedule rules", () => {
  it("normalizes Sunday to Monday midnight across a month boundary", () => {
    expect(getWeekStart(new Date(2026, 10, 1, 18, 35))).toEqual(new Date(2026, 9, 26));
  });

  it("uses the lesson date and exact start/end boundaries", () => {
    const lesson = { date: "2026-09-21", startTime: "10:00", endTime: "11:30" };
    expect(getLessonStatus(lesson, new Date(2026, 8, 21, 9, 49, 59)).state).toBe("next");
    expect(getLessonStatus(lesson, new Date(2026, 8, 21, 9, 50)).state).toBe("soon");
    expect(getLessonStatus(lesson, new Date(2026, 8, 21, 9, 59, 59)).state).toBe("soon");
    expect(getLessonStatus(lesson, new Date(2026, 8, 21, 10)).state).toBe("now");
    expect(getLessonStatus(lesson, new Date(2026, 8, 21, 11, 30)).state).toBe("past");
    expect(getLessonStatus(lesson, new Date(2026, 8, 22, 9)).state).toBe("past");
  });

  it("shares stable lessons across daily and weekly views with personal role scopes", () => {
    const monday = getDemoWeekSchedule(new Date(2026, 8, 21, 0));
    const sunday = getDemoWeekSchedule(new Date(2026, 8, 27, 23));
    expect(monday).toEqual(sunday);
    expect(new Set(monday.map((lesson) => lesson.id)).size).toBe(monday.length);
    expect(monday.some((lesson) => lesson.dayOfWeek === 0 || lesson.dayOfWeek === 6)).toBe(false);
    const student = getPersonalSchedule(monday, "student");
    const teacher = getPersonalSchedule(monday, "teacher");
    expect(student.length).toBeGreaterThan(0);
    expect(teacher.length).toBeGreaterThan(0);
    expect(student.every((lesson) => lesson.group === "112-МКо")).toBe(true);
    expect(teacher.every((lesson) => lesson.teacher === DEMO_TEACHER)).toBe(true);
    expect(student).not.toEqual(teacher);
  });

  it("detects intersecting slots but allows adjacent lessons", () => {
    const slots = [{ start: 9 * 60, end: 10 * 60 + 30 }];
    expect(hasTimeOverlap(10 * 60, 11 * 60, slots)).toBe(true);
    expect(hasTimeOverlap(10 * 60 + 30, 12 * 60, slots)).toBe(false);
  });

  it("formats a date using local calendar parts", () => {
    expect(toLocalDateKey(new Date(2026, 8, 7, 23, 30))).toBe("2026-09-07");
  });
});
