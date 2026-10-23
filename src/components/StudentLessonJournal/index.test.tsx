import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AcademicLesson } from "../../domain/academic";
import type { Student } from "../Attendance/data/students";
import StudentLessonJournal from ".";

const lessons: AcademicLesson[] = [
  { id: "practice", subjectId: "subject", groupId: "group", semesterId: "fall", date: "2026-10-21", startsAt: "10:10", type: "practice", state: "completed", topic: "Практические задачи", room: "305" },
  { id: "lecture", subjectId: "subject", groupId: "group", semesterId: "fall", date: "2026-10-22", startsAt: "10:10", type: "lecture", state: "completed", topic: "Важная лекция", room: "305" },
  { id: "future", subjectId: "subject", groupId: "group", semesterId: "fall", date: "2026-10-30", startsAt: "10:10", type: "practice", state: "scheduled", topic: "Будущий практикум", room: "305" },
  { id: "cancelled", subjectId: "subject", groupId: "group", semesterId: "fall", date: "2026-10-31", startsAt: "10:10", type: "practice", state: "cancelled", topic: "Отменённая пара", room: "305" },
  { id: "rescheduled", subjectId: "subject", groupId: "group", semesterId: "fall", date: "2026-10-29", startsAt: "10:10", type: "practice", state: "rescheduled", topic: "Перенесённая пара", room: "305" },
];
const student: Student = { id: "student", name: "Студент", attendance: { practice: "sick", lecture: "present" }, grades: { practice: 5, lecture: 2 } };
const render = (path = "/journal/subject/group") => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><StudentLessonJournal student={student} lessons={lessons} now={new Date(2026, 9, 23)} /></MemoryRouter>);

describe("student lesson journal", () => {
  it("shows date, attendance and grade together without a horizontal table", () => {
    const html = render();
    expect(html).toContain("Уважительная причина");
    expect(html).toContain("Практические задачи");
    expect(html).toContain("Средний балл");
    expect(html).toContain("5.00");
    expect(html).toContain("50%");
    expect(html).toContain("Не предусмотрена");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Редактировать");
  });
  it("separates scheduled lessons from results and respects the URL lesson filter", () => {
    const html = render("/journal/subject/group?lessonType=practice&month=2026-10");
    expect(html).toContain("Будущий практикум");
    expect(html).toContain("Предстоит");
    expect(html).not.toContain("Важная лекция");
    expect(html).toContain("0%");
    expect(html.split("Мои результаты")[0]).not.toContain("50%");
  });
  it("keeps period metrics stable when the URL slice has no matching results and offers a reset", () => {
    const html = render("/journal/subject/group?month=2026-10&result=low-grade");
    expect(html).toContain("5.00");
    expect(html).toContain("50%");
    expect(html).toContain("Показано 0 из 2");
    expect(html).toContain("Таких результатов за период нет");
    expect(html).toContain("Показать все результаты");
    expect(html).not.toContain("data-student-lesson=");
    expect(html).not.toContain("Будущий практикум");
  });
  it("counts only scheduled lessons remaining within the selected period and type, independently of the results slice", () => {
    const metric = (path: string) => render(path).match(/data-student-metric="remaining"[\s\S]*?<strong>([0-9]+)<\/strong>/)?.[1];
    expect(metric("/journal/subject/group?month=2026-10")).toBe("1");
    expect(metric("/journal/subject/group?month=2026-10&result=absent")).toBe("1");
    expect(metric("/journal/subject/group?month=2026-10&lessonType=lecture")).toBe("0");
  });
});
