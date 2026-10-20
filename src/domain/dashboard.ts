import { isPerformanceLesson, type AcademicLesson } from "./academic";
import { isPerformanceGrade } from "./gradeDistribution";

export type DashboardMembership = {
  subjectId: string;
  groupIds: string[];
};

export type DashboardJournalStudent = {
  id: string;
  attendance: Record<string, string>;
  grades: Record<string, number | null>;
};

export type DashboardJournal = {
  subjectId: string;
  groupId: string;
  students: DashboardJournalStudent[];
  lessons?: AcademicLesson[];
};

export type DashboardJournalMetrics = {
  averageGrade: number | null;
  attendance: number | null;
  attendanceMarked: number;
  gradesCount: number;
  gradeCells: number;
  totalCells: number;
  unmarked: number;
};

export const calculateDashboardJournalMetrics = (
  journals: DashboardJournal[],
  studentId?: string,
): DashboardJournalMetrics => {
  const students = journals.flatMap((journal) => {
    const lessons = journal.lessons?.filter((lesson) => lesson.state === "completed");
    const attendanceIds = lessons?.map((lesson) => lesson.id);
    const gradeIds = lessons?.filter(isPerformanceLesson).map((lesson) => lesson.id);
    return (studentId ? journal.students.filter((student) => student.id === studentId) : journal.students)
      .map((student) => ({ student, attendanceIds, gradeIds }));
  });
  const attendance = students.flatMap(({ student, attendanceIds }) => attendanceIds
    ? attendanceIds.map((id) => student.attendance[id] ?? "unmarked") : Object.values(student.attendance));
  const attendanceMarked = attendance.filter((status) => status !== "unmarked");
  const grades = students
    .flatMap(({ student, gradeIds }) => gradeIds ? gradeIds.map((id) => student.grades[id]) : Object.values(student.grades))
    .filter(isPerformanceGrade);
  const present = attendanceMarked.filter((status) => status === "present").length;

  return {
    averageGrade: grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null,
    attendance: attendanceMarked.length ? present / attendanceMarked.length * 100 : null,
    attendanceMarked: attendanceMarked.length,
    gradesCount: grades.length,
    gradeCells: students.reduce((total, { student, gradeIds }) => total + (gradeIds?.length ?? Object.keys(student.grades).length), 0),
    totalCells: attendance.length,
    unmarked: attendance.filter((status) => status === "unmarked").length,
  };
};

const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

export const formatDashboardDeadline = (deadline: string, now: Date) => {
  const value = new Date(deadline);
  const days = Math.round((startOfDay(value).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const time = value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  if (days < -1) return `Просрочено на ${Math.abs(days)} дн.`;
  if (days === -1) return "Просрочено со вчера";
  if (days === 0) return `Сегодня, ${time}`;
  if (days === 1) return `Завтра, ${time}`;
  return value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
};

export const formatDashboardValue = (value: number | null, digits = 0) =>
  value === null ? "—" : value.toFixed(digits).replace(".", ",");
