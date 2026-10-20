import { calculateDashboardJournalMetrics, type DashboardJournal } from "../domain/dashboard";
import { getSubmissionStatus } from "../domain/assignments";
import { SUBJECT_GROUP_OFFERINGS } from "./academicCatalog";
import { getAssignments, getSubmissions } from "./assignmentStore";
import { decodeJournal, getJournalSnapshot, journalKey } from "./journalStore";
import { createSubjectLessons } from "./lessons";
import type { Student } from "../components/Attendance/data/students";

export const readStudentGroupJournals = (groupId: string) => {
  const journals: Array<Omit<DashboardJournal, "students"> & { students: Student[] }> = [];
  let unavailable = false;
  SUBJECT_GROUP_OFFERINGS.filter((offering) => offering.groupId === groupId).forEach(({ subjectId }) => {
    try {
      const raw = localStorage.getItem(journalKey(subjectId, groupId));
      // Dashboard readers fall back to demo data on corruption; profiles must expose missing metrics instead.
      if (raw !== null && decodeJournal(raw) === null) throw new Error("Сохранённый журнал повреждён");
      journals.push({ subjectId, groupId, students: getJournalSnapshot(subjectId, groupId), lessons: createSubjectLessons(subjectId, groupId) });
    } catch (error) {
      unavailable = true;
      console.error(`Не удалось прочитать журнал ${subjectId}/${groupId} для профиля студента.`, error);
    }
  });
  return { journals, unavailable };
};

const isRecord = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item);
const hasStrings = (item: Record<string, unknown>, fields: string[]) => fields.every((field) => typeof item[field] === "string");

const assertLearningStorage = () => {
  for (const key of ["bi-university-demo-assignments", "bi-university-demo-submissions"]) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items) || !items.every((item: unknown) => {
      if (!isRecord(item)) return false;
      if (key.endsWith("assignments")) return hasStrings(item, ["id", "subject", "group", "title", "lessonDate", "deadline"])
        && (item.status === undefined || ["draft", "published", "closed", "archived"].includes(String(item.status)));
      return hasStrings(item, ["id", "assignmentId", "studentId", "studentName", "sentAt"])
        && (item.status === undefined || ["submitted", "revision", "graded"].includes(String(item.status)))
        && (item.attempts === undefined || (Array.isArray(item.attempts) && item.attempts.every((attempt) => isRecord(attempt)
          && (attempt.status === undefined || ["submitted", "revision", "graded"].includes(String(attempt.status))))));
    })) throw new Error(`Некорректный формат хранилища ${key}`);
  }
};

export const getStudentProfileMetrics = (studentId: string, groupId?: string) => {
  const result = { averageGrade: null as number | null, attendance: null as number | null, completedWorks: null as number | null, totalWorks: null as number | null, error: "" };
  if (!groupId) return result;
  const { journals, unavailable } = readStudentGroupJournals(groupId);
  if (unavailable) result.error = "Часть журналов недоступна. Учебные показатели не рассчитаны.";
  if (!journals.some((journal) => journal.students.some((student) => student.id === studentId))) return result;
  if (!unavailable) {
    const metrics = calculateDashboardJournalMetrics(journals, studentId);
    result.averageGrade = metrics.averageGrade;
    result.attendance = metrics.attendance;
  }
  try {
    assertLearningStorage();
    const subjects = new Set(SUBJECT_GROUP_OFFERINGS.filter((offering) => offering.groupId === groupId).map((offering) => offering.subjectId));
    const assignments = getAssignments().filter((assignment) => assignment.groupId === groupId && subjects.has(assignment.subjectId)
      && (assignment.status === "published" || assignment.status === "closed"));
    const answers = new Map<string, ReturnType<typeof getSubmissions>[number]>();
    getSubmissions().filter((submission) => submission.studentId === studentId).forEach((submission) => {
      const previous = answers.get(submission.assignmentId);
      if (!previous || Date.parse(submission.updatedAt) >= Date.parse(previous.updatedAt)) answers.set(submission.assignmentId, submission);
    });
    result.totalWorks = assignments.length;
    result.completedWorks = assignments.filter((assignment) => {
      const status = getSubmissionStatus(answers.get(assignment.id));
      return status === "submitted" || status === "graded";
    }).length;
  } catch (error) {
    result.error = [result.error, "Не удалось прочитать задания и ответы. Количество сданных работ недоступно."].filter(Boolean).join(" ");
    console.error("Не удалось рассчитать сданные работы в профиле студента.", error);
  }
  return result;
};
