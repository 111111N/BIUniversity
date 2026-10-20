import type { Assignment, Submission, SubmissionAttempt, SubmissionStatus } from "../data/assignmentStore";

export type StudentAssignmentState =
  | "graded"
  | "revision"
  | "resubmitted"
  | "submitted"
  | "late-allowed"
  | "overdue"
  | "pending";

export type AssignmentDeadlineState = "scheduled" | "due-soon" | "overdue";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const isAssignmentVisibleToStudent = (assignment: Assignment, studentGroup: string) =>
  assignment.group === studentGroup && (assignment.status === "published" || assignment.status === "closed");

export const isSubmissionAllowed = (assignment: Assignment, now = new Date()) => {
  if (assignment.status !== "published") return false;
  return assignment.allowLateSubmissions || new Date(assignment.deadline).getTime() >= now.getTime();
};

export const getSubmissionAttempts = (submission?: Submission): SubmissionAttempt[] => {
  if (!submission) return [];
  if (submission.attempts?.length) return submission.attempts;

  return [{
    id: `${submission.id}-attempt-1`,
    number: 1,
    sentAt: submission.sentAt,
    updatedAt: submission.updatedAt,
    text: submission.text,
    attachmentId: submission.attachmentId,
    attachmentName: submission.attachmentName,
    status: submission.status,
    submittedLate: false,
    teacherComment: submission.teacherComment ?? submission.comment,
    grade: submission.grade,
  }];
};

export const getCurrentSubmissionAttempt = (submission?: Submission) => {
  const attempts = getSubmissionAttempts(submission);
  return attempts[attempts.length - 1];
};

export const getSubmissionStatus = (submission?: Submission): SubmissionStatus | undefined =>
  getCurrentSubmissionAttempt(submission)?.status ?? submission?.status;

export const isAttemptLate = (assignment: Assignment, sentAt: string) =>
  new Date(sentAt).getTime() > new Date(assignment.deadline).getTime();

export const getAssignmentDeadlineState = (assignment: Assignment, now = new Date()): AssignmentDeadlineState => {
  const remaining = new Date(assignment.deadline).getTime() - now.getTime();
  if (remaining < 0) return "overdue";
  if (remaining <= DAY_IN_MS * 2) return "due-soon";
  return "scheduled";
};

export const getStudentAssignmentState = (
  assignment: Assignment,
  submission?: Submission,
  now = new Date(),
): StudentAssignmentState => {
  const currentAttempt = getCurrentSubmissionAttempt(submission);
  if (currentAttempt?.status === "graded") return "graded";
  if (currentAttempt?.status === "revision") return "revision";
  if (currentAttempt?.status === "submitted") {
    return getSubmissionAttempts(submission).length > 1 ? "resubmitted" : "submitted";
  }
  if (new Date(assignment.deadline).getTime() < now.getTime()) {
    return isSubmissionAllowed(assignment, now) ? "late-allowed" : "overdue";
  }
  return "pending";
};
