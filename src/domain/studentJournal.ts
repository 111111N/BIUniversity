import { isPerformanceLesson, type AcademicLesson, type LessonType } from "./academic";
import type { Student } from "../components/Attendance/data/students";
import { toLocalDateKey } from "./schedule";

export const getStudentJournalMonths = (lessons: AcademicLesson[]) =>
  [...new Set(lessons.map((lesson) => lesson.date.slice(0, 7)))].sort();

export const resolveStudentJournalMonth = (requested: string | null, months: string[], now: Date) => {
  if (requested === "all" || requested && months.includes(requested)) return requested;
  const currentMonth = toLocalDateKey(now).slice(0, 7);
  return months.includes(currentMonth) ? currentMonth : months.filter((month) => month <= currentMonth).at(-1) ?? months[0] ?? "all";
};

export const selectStudentJournalLessons = (lessons: AcademicLesson[], month: string, type: "all" | LessonType) =>
  lessons.filter((lesson) => (month === "all" || lesson.date.startsWith(`${month}-`)) && (type === "all" || lesson.type === type))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startsAt.localeCompare(a.startsAt) || a.id.localeCompare(b.id));

export const studentResultFilters = ["all", "unmarked", "absent", "low-grade"] as const;
export type StudentResultFilter = typeof studentResultFilters[number];
export const readStudentResultFilter = (params: URLSearchParams): StudentResultFilter =>
  studentResultFilters.find((value) => value === params.get("result")) ?? "all";

export const selectStudentResults = (lessons: AcademicLesson[], student: Student, filter: StudentResultFilter) => lessons.filter((lesson) => {
  if (lesson.state !== "completed") return false;
  if (filter === "all") return true;
  if (filter === "low-grade") return isPerformanceLesson(lesson) && (student.grades[lesson.id] === 2 || student.grades[lesson.id] === 3);
  return (student.attendance[lesson.id] ?? "unmarked") === filter;
});
