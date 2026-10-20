import type { Assignment, Submission } from "../data/assignmentStore";
import { getStudentAssignmentState, getSubmissionStatus, isSubmissionAllowed } from "./assignments";
import { matchesSearchText } from "./search";

export type AssignmentView = "current" | "review" | "drafts" | "archive" | "todo" | "waiting" | "results" | "all";
export type AssignmentSort = "deadline" | "newest" | "title";
export const teacherAssignmentViews = [{ value: "current", label: "Текущие" }, { value: "review", label: "Требуют проверки" }, { value: "drafts", label: "Черновики" }, { value: "archive", label: "Архив" }] as const;
export const studentAssignmentViews = [{ value: "todo", label: "Нужно сделать" }, { value: "waiting", label: "На проверке" }, { value: "results", label: "Результаты" }, { value: "all", label: "Все" }] as const;

export const indexAssignmentSubmissions = (submissions: Submission[], studentId: string) => {
  const byAssignment = new Map<string, Submission[]>();
  const mine = new Map<string, Submission>();
  const pending = new Map<string, number>();
  for (const submission of submissions) {
    const answers = byAssignment.get(submission.assignmentId) ?? [];
    answers.push(submission);
    byAssignment.set(submission.assignmentId, answers);
    if (getSubmissionStatus(submission) === "submitted") pending.set(submission.assignmentId, (pending.get(submission.assignmentId) ?? 0) + 1);
    if (submission.studentId === studentId) {
      const previous = mine.get(submission.assignmentId);
      if (!previous || Date.parse(submission.updatedAt) >= Date.parse(previous.updatedAt)) mine.set(submission.assignmentId, submission);
    }
  }
  return { byAssignment, mine, pending };
};

export const matchesAssignmentView = (assignment: Assignment, view: AssignmentView, pending: number, answer?: Submission, now = new Date()) => {
  if (view === "current") return assignment.status === "published" || assignment.status === "closed";
  if (view === "review") return pending > 0;
  if (view === "drafts") return assignment.status === "draft";
  if (view === "archive") return assignment.status === "archived";
  if (view === "waiting") return getSubmissionStatus(answer) === "submitted";
  if (view === "results") return getSubmissionStatus(answer) === "graded";
  if (view === "todo") return isSubmissionAllowed(assignment, now) && (!answer || getSubmissionStatus(answer) === "revision");
  return true;
};

export const selectAssignmentList = (assignments: Assignment[], indexes: ReturnType<typeof indexAssignmentSubmissions>, view: AssignmentView, query: string, sort: AssignmentSort, now = new Date()) => assignments
  .filter((assignment) => matchesAssignmentView(assignment, view, indexes.pending.get(assignment.id) ?? 0, indexes.mine.get(assignment.id), now)
    && matchesSearchText(`${assignment.title} ${assignment.description} ${assignment.subject} ${assignment.group}`, query))
  .sort((first, second) => (sort === "title" ? first.title.localeCompare(second.title, "ru-RU") : sort === "newest" ? second.createdAt.localeCompare(first.createdAt) : first.deadline.localeCompare(second.deadline)) || first.id.localeCompare(second.id));

export const getStudentAssignmentLabel = (assignment: Assignment, answer?: Submission, now = new Date()) => {
  const state = getStudentAssignmentState(assignment, answer, now);
  if (state === "graded") return "Работа проверена";
  if (state === "revision") return isSubmissionAllowed(assignment, now) ? "Нужна доработка" : "Доработка · приём закрыт";
  if (state === "submitted" || state === "resubmitted") return state === "resubmitted" ? "Повторно отправлено" : "На проверке";
  if (!isSubmissionAllowed(assignment, now)) return "Приём закрыт";
  return state === "late-allowed" ? "Можно сдать с опозданием" : "Ожидает ответа";
};
