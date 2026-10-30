import type { Assignment, Submission } from "../data/assignmentStore";
import { getCurrentSubmissionAttempt, getStudentAssignmentState, isSubmissionAllowed } from "./assignments";
import { formatDashboardDeadline, type DashboardMembership } from "./dashboard";
import { getAssignmentHref } from "./journalNavigation";

const stateLabels = {
  pending: "Новое",
  submitted: "На проверке",
  resubmitted: "На проверке",
  revision: "На доработке",
  graded: "Проверено",
  "late-allowed": "Можно сдать с опозданием",
  overdue: "Приём завершён",
} as const;

export const getStudentDashboardTasks = (
  assignments: Assignment[],
  submissions: Submission[],
  memberships: DashboardMembership[],
  studentId: string,
  now: Date,
) => {
  const answers = new Map(submissions.filter((answer) => answer.studentId === studentId).map((answer) => [answer.assignmentId, answer]));
  return assignments
    .filter((assignment) => (assignment.status === "published" || assignment.status === "closed")
      && memberships.some((membership) => membership.subjectId === assignment.subjectId && membership.groupIds.includes(assignment.groupId)))
    .map((assignment) => {
      const answer = answers.get(assignment.id);
      const attempt = getCurrentSubmissionAttempt(answer);
      const state = getStudentAssignmentState(assignment, answer, now);
      const canSubmit = isSubmissionAllowed(assignment, now) && (!answer || attempt?.status === "revision");
      const completed = state === "graded";
      const overdue = (state === "pending" || state === "revision" || state === "overdue" || state === "late-allowed") && new Date(assignment.deadline).getTime() < now.getTime();
      return {
        id: assignment.id,
        subject: assignment.subject,
        subjectId: assignment.subjectId,
        title: assignment.title,
        deadline: canSubmit ? formatDashboardDeadline(assignment.deadline, now) : new Date(assignment.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
        deadlineAt: new Date(assignment.deadline).getTime(),
        tag: assignment.status === "closed" && (!answer || attempt?.status === "revision") ? "Приём завершён" : stateLabels[state],
        state,
        completed,
        overdue,
        canSubmit,
        href: getAssignmentHref(assignment),
        action: canSubmit ? attempt?.status === "revision" ? "Исправить ответ" : "Ответить" : answer ? "Посмотреть ответ" : "Открыть задание",
      };
    })
    .sort((first, second) => Number(second.canSubmit) - Number(first.canSubmit) || Number(first.completed) - Number(second.completed) || first.deadlineAt - second.deadlineAt);
};
