import type { Student } from "../components/Attendance/data/students";
import type { AcademicLesson } from "./academic";
import { lessonTypeLabels } from "./academic";
import { createCsv } from "./csv";
import { downloadBlob } from "./fileDownload";

const attendanceLabels: Record<string, string> = { unmarked: "Не отмечено", present: "Присутствовал", sick: "Уважительная причина", absent: "Пропуск" };

export const createJournalCsv = (students: Student[], lessons: AcademicLesson[]) => {
  const header = ["Студент", ...lessons.flatMap((lesson) => [`${lesson.date} · ${lessonTypeLabels[lesson.type]} · посещаемость`, `${lesson.date} · ${lessonTypeLabels[lesson.type]} · оценка`]), "Посещаемость, %", "Средний балл"];
  const rows = students.map((student) => {
    const marked = lessons.filter((lesson) => (student.attendance[lesson.id] ?? "unmarked") !== "unmarked");
    const present = marked.filter((lesson) => student.attendance[lesson.id] === "present").length;
    const grades = lessons.map((lesson) => student.grades[lesson.id]).filter((grade): grade is 2 | 3 | 4 | 5 => grade != null);
    return [
      student.name,
      ...lessons.flatMap((lesson) => [attendanceLabels[student.attendance[lesson.id] ?? "unmarked"], student.grades[lesson.id] ?? ""]),
      marked.length ? Math.round(present / marked.length * 100) : "",
      grades.length ? (grades.reduce((sum, grade) => sum + grade, 0) / grades.length).toFixed(2) : "",
    ];
  });
  return createCsv([header, ...rows]);
};

export const downloadJournalCsv = (csv: string, fileName: string) => {
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName);
};
