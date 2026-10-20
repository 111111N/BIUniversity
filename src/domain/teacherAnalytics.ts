import { isPerformanceLesson, type AcademicLesson } from "./academic";
import type { Student } from "../components/Attendance/data/students";
import type { Assignment, Submission } from "../data/assignmentStore";
import { getCurrentSubmissionAttempt, getSubmissionAttempts } from "./assignments";
import { getJournalMetrics } from "./journal";
import { isPerformanceGrade, normalizeGradeShares, PERFORMANCE_GRADES } from "./gradeDistribution";
import { createCsv } from "./csv";
import { getWeekStart } from "./schedule";

export type AnalyticsPeriod = "semester" | "month" | "four-weeks" | "week";
export type AnalyticsJournal = { subjectId: string; subjectName: string; subjectShortName: string; groupId: string; groupName: string; students: Student[]; lessons: AcademicLesson[] };
export type AnalyticsRange = { start: Date; end: Date };
type StudentSignal = { id: string; name: string; groupId: string; groupName: string; subjectId: string; marked: number; present: number; grades: number[]; overdue: number };

export const getAnalyticsRange = (period: AnalyticsPeriod, now: Date, selectedWeek = now): AnalyticsRange => {
  if (period === "week") {
    const start = getWeekStart(selectedWeek);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setMilliseconds(-1);
    if (start.getMonth() === 7 && end.getMonth() === 8) start.setMonth(8, 1);
    return { start, end };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "month") start.setDate(1);
  else if (period === "four-weeks") start.setDate(start.getDate() - 27);
  else {
    const month = now.getMonth();
    start.setFullYear(month === 0 ? now.getFullYear() - 1 : now.getFullYear(), month >= 8 || month === 0 ? 8 : 1, 1);
  }
  return { start, end: new Date(now) };
};

const inRange = (date: string, range: AnalyticsRange) => {
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
};
const journalId = (subjectId: string, groupId: string) => `${subjectId}:${groupId}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("");
const weekKey = (date: string) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - (value.getDay() + 6) % 7);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

export const calculateTeacherAnalytics = (journals: AnalyticsJournal[], assignments: Assignment[], submissions: Submission[], range: AnalyticsRange, gradeFilter?: number) => {
  const scoped = journals.map((journal) => {
    const lessons = journal.lessons.filter((lesson) => lesson.state === "completed" && inRange(`${lesson.date}T${lesson.startsAt}`, range));
    const students = gradeFilter === undefined ? journal.students : journal.students
      .filter((student) => lessons.some((lesson) => isPerformanceLesson(lesson) && student.grades[lesson.id] === gradeFilter))
      .map((student) => ({ ...student, grades: Object.fromEntries(Object.entries(student.grades).filter(([, grade]) => grade === gradeFilter)) }));
    return { ...journal, lessons, students };
  }).filter((journal) => gradeFilter === undefined || journal.students.length > 0);
  const journalById = new Map(scoped.map((journal) => [journalId(journal.subjectId, journal.groupId), journal]));
  const uniqueStudents = new Set(scoped.flatMap((journal) => journal.students.map((student) => `${journal.groupId}:${student.id}`)));
  const totals = { marked: 0, present: 0, unmarked: 0, cells: 0, grades: [] as number[] };
  const weeks = new Map<string, { present: number; marked: number }>();
  const students = new Map<string, StudentSignal>();
  const groupMetrics = scoped.map((journal) => {
    const ids = journal.lessons.map((lesson) => lesson.id);
    const metrics = getJournalMetrics(journal.students, ids, journal.lessons.filter(isPerformanceLesson).map((lesson) => lesson.id));
    totals.marked += metrics.marked; totals.unmarked += metrics.unmarked; totals.cells += metrics.total;
    journal.students.forEach((student) => {
      const key = `${journal.groupId}:${student.id}`;
      const item: StudentSignal = students.get(key) ?? { id: student.id, name: student.name, groupId: journal.groupId, groupName: journal.groupName, subjectId: journal.subjectId, marked: 0, present: 0, grades: [], overdue: 0 };
      journal.lessons.forEach((lesson) => {
        const status = student.attendance[lesson.id] ?? "unmarked";
        const grade = student.grades[lesson.id];
        if (isPerformanceLesson(lesson) && isPerformanceGrade(grade)) { totals.grades.push(grade); item.grades.push(grade); }
        if (status !== "unmarked") {
          const present = Number(status === "present");
          item.marked += 1; item.present += present; totals.present += present;
          const key = weekKey(lesson.date);
          const point = weeks.get(key) ?? { present: 0, marked: 0 };
          point.marked += 1; point.present += present; weeks.set(key, point);
        }
      });
      students.set(key, item);
    });
    return { ...metrics, id: journalId(journal.subjectId, journal.groupId), subjectId: journal.subjectId, subjectName: journal.subjectName, subjectShortName: journal.subjectShortName, groupId: journal.groupId, groupName: journal.groupName, students: journal.students.length };
  });
  const visibleAssignments = assignments.filter((assignment) => (assignment.status === "published" || assignment.status === "closed") && journalById.has(journalId(assignment.subjectId, assignment.groupId)) && inRange(assignment.lessonDate, range));
  const answers = new Map<string, Submission>();
  submissions.forEach((submission) => {
    const key = `${submission.assignmentId}:${submission.studentId}`;
    const previous = answers.get(key);
    if (!previous || Date.parse(submission.updatedAt) > Date.parse(previous.updatedAt)) answers.set(key, submission);
  });
  const work = { assignments: visibleAssignments.length, expected: 0, received: 0, onTime: 0, waiting: 0, revision: 0, graded: 0, overdue: 0 };
  visibleAssignments.forEach((assignment) => {
    const journal = journalById.get(journalId(assignment.subjectId, assignment.groupId));
    if (!journal) return;
    journal.students.forEach((student) => {
      work.expected += 1;
      const answer = answers.get(`${assignment.id}:${student.id}`);
      const attempt = getCurrentSubmissionAttempt(answer);
      if (attempt && new Date(attempt.sentAt).getTime() <= range.end.getTime()) {
        work.received += 1;
        const firstAttempt = getSubmissionAttempts(answer)[0];
        if (firstAttempt && Date.parse(firstAttempt.sentAt) <= Date.parse(assignment.deadline)) work.onTime += 1;
        if (attempt.status === "submitted") work.waiting += 1;
        if (attempt.status === "revision") work.revision += 1;
        if (attempt.status === "graded") work.graded += 1;
      } else if (Date.parse(assignment.deadline) < range.end.getTime()) work.overdue += 1;
      if ((!attempt || attempt.status === "revision") && Date.parse(assignment.deadline) < range.end.getTime()) {
        const person = students.get(`${journal.groupId}:${student.id}`);
        if (person) person.overdue += 1;
      }
    });
  });
  const risks = Array.from(students.values()).flatMap((student) => {
    const attendance = student.marked ? student.present / student.marked * 100 : null;
    const average = student.grades.length ? student.grades.reduce((sum, grade) => sum + grade, 0) / student.grades.length : null;
    const reasons: string[] = [];
    if (student.marked >= 3 && attendance !== null && attendance < 65) reasons.push(`Посещаемость ${Math.round(attendance)}%`);
    if (student.grades.length >= 2 && average !== null && average < 3) reasons.push(`Средний балл ${average.toFixed(2).replace(".", ",")}`);
    if (student.overdue >= 2) reasons.push(`Работ к сдаче после срока: ${student.overdue}`);
    if (!reasons.length) return [];
    const high = (student.marked >= 3 && attendance !== null && attendance < 50) || (student.grades.length >= 2 && average !== null && average < 2.5) || student.overdue >= 3;
    return [{ ...student, key: `${student.groupId}:${student.id}`, initials: initials(student.name), reasons, level: high ? "Высокий" : "Средний" }];
  }).sort((a, b) => Number(b.level === "Высокий") - Number(a.level === "Высокий") || b.overdue - a.overdue || a.name.localeCompare(b.name, "ru"));
  const distribution = PERFORMANCE_GRADES.map((grade) => totals.grades.filter((value) => value === grade).length);
  return {
    students: uniqueStudents.size, groups: new Set(scoped.map((journal) => journal.groupId)).size, journals: scoped.length,
    attendance: totals.marked ? totals.present / totals.marked * 100 : null,
    averageGrade: totals.grades.length ? totals.grades.reduce((sum, grade) => sum + grade, 0) / totals.grades.length : null,
    marked: totals.marked, unmarked: totals.unmarked, cells: totals.cells, gradesCount: totals.grades.length,
    distribution, shares: normalizeGradeShares(distribution), groupMetrics, risks, work,
    trend: Array.from(weeks, ([date, point]) => ({ date, value: point.present / point.marked * 100, marked: point.marked })).sort((a, b) => a.date.localeCompare(b.date)),
  };
};

export type TeacherAnalytics = ReturnType<typeof calculateTeacherAnalytics>;

export const createAnalyticsCsv = (analytics: TeacherAnalytics, range: AnalyticsRange, context: string) => {
  const value = (number: number | null) => number === null ? "" : number.toFixed(2).replace(".", ",");
  const rows: Array<Array<string | number>> = [
    ["Статистика преподавателя", context], ["Период", range.start.toLocaleDateString("ru-RU"), range.end.toLocaleDateString("ru-RU")],
    ["Студентов (без повторов внутри группы)", analytics.students], ["Групп", analytics.groups],
    ["Посещаемость, %", value(analytics.attendance)], ["Средний балл (практики и лабораторные)", value(analytics.averageGrade)],
    ["Отметок посещаемости", analytics.marked], ["Не заполнено", analytics.unmarked], ["Оценок", analytics.gradesCount],
    [], ["Группа", "Дисциплина", "Студентов", "Посещаемость, %", "Средний балл (практики и лабораторные)", "Заполнено", "Всего ячеек"],
    ...analytics.groupMetrics.map((group) => [group.groupName, group.subjectName, group.students, value(group.attendance), value(group.average), group.marked, group.total]),
    [], ["Оценка (практики и лабораторные)", "Количество", "Доля, %"], ...PERFORMANCE_GRADES.map((grade, index) => [grade, analytics.distribution[index], analytics.shares[index]]),
    [], ["Заданий (по дате занятия)", analytics.work.assignments], ["Ожидается ответов", analytics.work.expected], ["Получено ответов", analytics.work.received], ["На проверке", analytics.work.waiting], ["На доработке", analytics.work.revision], ["Проверено", analytics.work.graded], ["Без ответа после срока", analytics.work.overdue],
    [], ["Требуют внимания", "Группа", "Уровень", "Причины"], ...analytics.risks.map((student) => [student.name, student.groupName, student.level, student.reasons.join(" · ")]),
  ];
  return createCsv(rows);
};
