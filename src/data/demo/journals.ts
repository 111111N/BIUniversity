import type { AttendanceStatus, Grade, Student } from "../../components/Attendance/data/students";
import { createSubjectLessons } from "../lessons";

const gradeProfiles: Grade[][] = [
  [5, 5, 5, 4, 4, 4, 3, 2, null, null],
  [5, 4, 4, 3, 3, 3, 2, 2, null, null],
  [5, 5, 4, 4, 4, 3, 3, 2, 2, null],
  [5, 5, 5, 5, 5, 4, 4, 4, 3, null],
  [5, 4, 3, 3, 3, 2, 2, 2, null, null],
];
const stableSeed = (value: string) => [...value].reduce((sum, letter, index) => sum + letter.charCodeAt(0) * (index + 1), 0);
const hasKey = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Adds only missing cells of the extended catalog; even an existing null/unmarked value is protected. */
export const createJournalDemoAdditions = (subjectId: string, groupId: string, students: Student[]) => {
  const lessons = createSubjectLessons(subjectId, groupId).filter((lesson) => lesson.id.includes(":weekly:") && lesson.state === "completed");
  const seed = stableSeed(`${subjectId}:${groupId}`);
  let cells = 0;
  let grades = 0;
  const changedLessons = new Set<string>();
  const next = students.map((student) => {
    const attendance = { ...student.attendance };
    const marks = { ...student.grades };
    const person = stableSeed(student.id);
    lessons.forEach((lesson, index) => {
      const week = Math.floor(index / 3);
      const sample = (seed + person + index * 13) % 23;
      const profile = (seed + week) % gradeProfiles.length;
      const generated: AttendanceStatus = sample === 0 ? "unmarked" : sample < 3 ? "sick" : sample < (profile === 4 ? 9 : 6) ? "absent" : "present";
      if (!hasKey(attendance, lesson.id)) {
        attendance[lesson.id] = generated;
        cells++;
        changedLessons.add(lesson.id);
      }
      if (!hasKey(marks, lesson.id)) {
        // An intentionally ungraded week verifies gaps, rather than fake zero grades, on charts.
        const ungradedWeek = subjectId === "data-analysis" && lesson.date >= "2026-09-28" && lesson.date <= "2026-10-02";
        const grade = lesson.type === "lecture" || attendance[lesson.id] !== "present" || ungradedWeek
          ? null : gradeProfiles[profile][(person + index * 7 + seed) % gradeProfiles[profile].length];
        marks[lesson.id] = grade;
        cells++;
        if (grade !== null) grades++;
        changedLessons.add(lesson.id);
      }
    });
    return { ...student, attendance, grades: marks };
  });
  return { students: next, cells, grades, lessons: changedLessons.size, from: lessons[0]?.date, to: lessons[lessons.length - 1]?.date };
};
