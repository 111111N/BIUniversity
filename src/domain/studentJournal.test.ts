import { describe, expect, it } from "vitest";
import type { AcademicLesson } from "./academic";
import { getStudentJournalMonths, readStudentResultFilter, resolveStudentJournalMonth, selectStudentJournalLessons, selectStudentResults } from "./studentJournal";
import type { Student } from "../components/Attendance/data/students";

const makeLesson = (id: string, date: string, type: AcademicLesson["type"] = "practice", startsAt = "10:10"): AcademicLesson => ({ id, date, type, startsAt, state: "completed", topic: "Тема", subjectId: "subject", groupId: "group", semesterId: "fall", room: "305" });
const lessons = [makeLesson("oct", "2026-10-23"), makeLesson("sep", "2026-09-09"), makeLesson("nov", "2026-11-02"), makeLesson("lecture", "2026-10-22", "lecture"), makeLesson("later", "2026-10-23", "laboratory", "14:10")];

describe("student journal periods", () => {
  it("selects the current month by default and keeps explicit periods from the URL", () => {
    const months = getStudentJournalMonths(lessons);
    expect(months).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(resolveStudentJournalMonth(null, months, new Date(2026, 9, 23))).toBe("2026-10");
    expect(resolveStudentJournalMonth("2026-09", months, new Date(2026, 9, 23))).toBe("2026-09");
    expect(resolveStudentJournalMonth("all", months, new Date(2026, 9, 23))).toBe("all");
  });
  it("recovers invalid or outdated periods without hiding every lesson", () => {
    const months = getStudentJournalMonths(lessons);
    expect(resolveStudentJournalMonth("bad", months, new Date(2027, 0, 1))).toBe("2026-11");
    expect(resolveStudentJournalMonth(null, months, new Date(2026, 7, 1))).toBe("2026-09");
    expect(resolveStudentJournalMonth(null, [], new Date(2026, 9, 23))).toBe("all");
  });
  it("combines month and lesson type, orders latest first, and preserves the source array", () => {
    const original = [...lessons];
    expect(selectStudentJournalLessons(lessons, "2026-10", "all").map(({ id }) => id)).toEqual(["later", "oct", "lecture"]);
    expect(selectStudentJournalLessons(lessons, "2026-10", "practice").map(({ id }) => id)).toEqual(["oct"]);
    expect(selectStudentJournalLessons(lessons, "all", "all")).toHaveLength(lessons.length);
    expect(lessons).toEqual(original);
  });
});

describe("student result slices", () => {
  const entries = [makeLesson("absent", "2026-10-21"), makeLesson("unmarked", "2026-10-22"), makeLesson("lecture", "2026-10-22", "lecture"), makeLesson("sick", "2026-10-23"), makeLesson("pass", "2026-10-23"), ...(["scheduled", "cancelled", "rescheduled"] as const).map((state) => ({ ...makeLesson(state, "2026-11-01"), state }))];
  const student: Student = { id: "one", name: "Студент", attendance: { absent: "absent", lecture: "present", sick: "sick", pass: "present", scheduled: "absent", cancelled: "absent" }, grades: { absent: 2, sick: 3, lecture: 2, pass: 4, scheduled: 2, cancelled: 2 } };
  it("includes only completed lessons, keeping future, cancelled and moved lessons out of problem counts", () => {
    expect(selectStudentResults(entries, student, "all")).toHaveLength(5);
    expect(selectStudentResults(entries, student, "absent").map(({ id }) => id)).toEqual(["absent"]);
    expect(selectStudentResults(entries, student, "unmarked").map(({ id }) => id)).toEqual(["unmarked"]);
  });
  it("selects grades 2 and 3 only for practices and laboratories without mutating attendance or grades", () => {
    const before = structuredClone(student);
    expect(selectStudentResults(entries, student, "low-grade").map(({ id }) => id)).toEqual(["absent", "sick"]);
    expect(student).toEqual(before);
    expect(entries).toHaveLength(8);
  });
  it("combines the slice with the explicit period and lesson type", () => {
    const selected = selectStudentJournalLessons(entries, "2026-10", "lecture");
    expect(selectStudentResults(selected, student, "low-grade")).toEqual([]);
    expect(selectStudentResults(selected, student, "all")).toHaveLength(1);
    expect(readStudentResultFilter(new URLSearchParams("result=absent"))).toBe("absent");
    expect(readStudentResultFilter(new URLSearchParams("result=bad"))).toBe("all");
  });
});
