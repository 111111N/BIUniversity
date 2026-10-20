import type { Student } from "../components/Attendance/data/students";
import { isPerformanceGrade, PERFORMANCE_GRADES } from "./gradeDistribution";

export const getJournalMetrics = (students: Student[], dates: string[], gradeDates = dates) => {
  const grades = students.flatMap((student) => gradeDates.map((date) => student.grades[date])).filter(isPerformanceGrade);
  const attendance = students.flatMap((student) => dates.map((date) => student.attendance[date])).filter((status) => status && status !== "unmarked");
  const present = attendance.filter((status) => status === "present").length;
  const total = students.length * dates.length;
  return {
    average: grades.length ? grades.reduce((sum, grade) => sum + grade, 0) / grades.length : null,
    attendance: attendance.length ? present / attendance.length * 100 : null,
    marked: attendance.length,
    total,
    unmarked: Math.max(total - attendance.length, 0),
    completion: total ? attendance.length / total * 100 : 0,
    gradesCount: grades.length,
    distribution: PERFORMANCE_GRADES.map((grade) => ({ grade, count: grades.filter((value) => value === grade).length })),
  };
};
