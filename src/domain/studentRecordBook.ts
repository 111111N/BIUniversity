import type { Assessment, AssessmentKind, AssessmentOutcome, AssessmentTeacherOption } from "./assessmentTypes";

export const RECORD_BOOK_SECTIONS = { passes: "Зачёты", exams: "Экзамены", internships: "Практики", coursework: "Курсовые работы", electives: "Факультативы", theses: "ВКР" } as const;
export type RecordBookSection = keyof typeof RECORD_BOOK_SECTIONS;
export interface StudentRecordBookRow {
  id: string; title: string; kind: AssessmentKind; semester: number | null; hours: number | null;
  section: RecordBookSection; date: string; startsAt: string; outcome: AssessmentOutcome;
  teacher: string | null; attemptNumber: number; attemptKind: "primary" | "retake" | "commission"; attempts: number;
}
export interface StudentRecordBookSemester { key: string; semester: number | null; rows: StudentRecordBookRow[] }
const sectionFor = (assessment: Assessment): RecordBookSection => assessment.recordBook?.category === "elective" ? "electives"
  : assessment.kind === "exam" ? "exams" : assessment.kind === "internship" ? "internships" : assessment.kind === "coursework" ? "coursework" : assessment.kind === "thesis" ? "theses" : "passes";

/** Only the student's own published result participates; a newer draft cannot erase an earlier result. */
export const buildStudentRecordBook = (assessments: readonly Assessment[], teachers: readonly AssessmentTeacherOption[], studentId: string): StudentRecordBookSemester[] => {
  const teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.name]));
  const semesters = new Map<string, StudentRecordBookSemester>();
  for (const assessment of assessments) {
    const published = assessment.attempts.filter((attempt) => attempt.state === "published" && attempt.studentIds.includes(studentId) && attempt.results.some((row) => row.studentId === studentId && row.outcome !== null));
    const latest = published.reduce<(typeof published)[number] | undefined>((previous, attempt) => !previous || attempt.number > previous.number ? attempt : previous, undefined);
    if (!latest) continue;
    const result = latest.results.find((row) => row.studentId === studentId)?.outcome;
    if (!result) continue;
    const semester = assessment.recordBook?.semester ?? null;
    const key = semester === null ? "unassigned" : String(semester);
    const group = semesters.get(key) ?? { key, semester, rows: [] };
    group.rows.push({
      id: assessment.id, title: ["exam", "pass", "gradedPass"].includes(assessment.kind) ? assessment.subjectName ?? assessment.title : assessment.title,
      kind: assessment.kind, semester, hours: assessment.recordBook?.hours ?? null, section: sectionFor(assessment), date: latest.date, startsAt: latest.startsAt,
      outcome: { ...result }, teacher: teacherNames.get(latest.teacherId) ?? null, attemptNumber: latest.number, attemptKind: latest.kind, attempts: published.length,
    });
    semesters.set(key, group);
  }
  return [...semesters.values()].sort((a, b) => (a.semester ?? Infinity) - (b.semester ?? Infinity)).map((semester) => ({ ...semester, rows: semester.rows.sort((a, b) => a.title.localeCompare(b.title, "ru")) }));
};
