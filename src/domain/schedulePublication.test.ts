import { describe, expect, it } from "vitest";
import { compareSchedulePublication } from "./schedulePublication";
import type { ManagedLesson } from "./scheduleManagement";

const lesson: ManagedLesson = { id: "managed:one", scheduleId: 100, groupId: "g", subjectId: "math", teacherId: "teacher", teacherName: "Преподаватель", date: "2026-10-26", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "305" };
describe("schedule publication comparison", () => {
  it("compares by stable ID instead of position", () => {
    const other = { ...lesson, id: "managed:two", scheduleId: 101 };
    expect(compareSchedulePublication([lesson, other], [other, lesson])).toEqual({ rows: [], counts: { added: 0, removed: 0, changed: 0, unchanged: 2 } });
  });
  it("identifies added and removed lessons even with matching content", () => {
    const result = compareSchedulePublication([lesson], [{ ...lesson, id: "managed:copy", scheduleId: 200 }]);
    expect(result.counts).toEqual({ added: 1, removed: 1, changed: 0, unchanged: 0 });
    expect(result.rows.find((row) => row.kind === "removed")?.before?.id).toBe(lesson.id);
  });
  it("lists every user-visible changed field without classifying a moved pair as deletion", () => {
    const next = { ...lesson, date: "2026-10-27", startsAt: "11:00", endsAt: "12:30", room: "202", type: "practice" as const, teacherId: "another", teacherName: "Другой преподаватель" };
    const result = compareSchedulePublication([lesson], [next]);
    expect(result.counts.changed).toBe(1); expect(result.counts.removed).toBe(0);
    expect(result.rows[0].fields).toEqual(expect.arrayContaining(["date", "startsAt", "endsAt", "room", "type", "teacherId", "teacherName"]));
  });
  it("detects subject/group transfers and display-name corrections", () => {
    expect(compareSchedulePublication([lesson], [{ ...lesson, subjectId: "physics", groupId: "other" }]).rows[0].fields).toEqual(["subjectId", "groupId"]);
    expect(compareSchedulePublication([lesson], [{ ...lesson, teacherName: "Исправленное имя" }]).rows[0].fields).toEqual(["teacherName"]);
  });
  it("supports first and empty publications", () => {
    expect(compareSchedulePublication([], [lesson]).counts.added).toBe(1);
    expect(compareSchedulePublication([lesson], []).counts.removed).toBe(1);
    expect(compareSchedulePublication([], []).rows).toEqual([]);
  });
  it("does not expose mutable references to either source", () => {
    const before = [{ ...lesson }]; const after = [{ ...lesson, room: "202" }];
    const result = compareSchedulePublication(before, after);
    result.rows[0].before!.room = "New"; result.rows[0].after!.room = "Another";
    expect(before[0].room).toBe("305"); expect(after[0].room).toBe("202");
  });
  it("rejects ambiguous or inconsistent identities", () => {
    expect(() => compareSchedulePublication([lesson, lesson], [])).toThrow("повторяющимися");
    expect(() => compareSchedulePublication([], [lesson, lesson])).toThrow("повторяющимися");
    expect(() => compareSchedulePublication([lesson], [{ ...lesson, scheduleId: 999 }])).toThrow("целостность");
  });
  it("handles large diffs in chronological order", () => {
    const source = Array.from({ length: 1000 }, (_, index) => ({ ...lesson, id: `managed:${index}`, scheduleId: index + 1 }));
    const next = source.map((entry) => ({ ...entry, date: "2026-10-27" }));
    const result = compareSchedulePublication(source, next);
    expect(result.rows).toHaveLength(1000); expect(result.counts.changed).toBe(1000);
    expect(compareSchedulePublication([lesson], [{ ...lesson, id: "managed:later", scheduleId: 200, date: "2026-10-28" }]).rows[0].kind).toBe("removed");
  });
});
