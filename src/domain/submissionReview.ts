import type { Submission } from "../data/assignmentStore";
import { getCurrentSubmissionAttempt, getSubmissionStatus } from "./assignments";
import { matchesSearchText } from "./search";

export type ReviewFilter = "all" | "submitted" | "revision" | "graded";
export type ReviewSort = "queue" | "newest" | "oldest" | "name";
export type ReviewDraft = { comment: string; grade: string };

const priority = { submitted: 0, revision: 1, graded: 2 };
const sentAt = (answer: Submission) => {
  const value = new Date(getCurrentSubmissionAttempt(answer)?.sentAt ?? answer.sentAt).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const getReviewSubmissions = (answers: Submission[], filter: ReviewFilter = "all", query = "", sort: ReviewSort = "queue") => answers
  .filter((answer) => (filter === "all" || getSubmissionStatus(answer) === filter) && matchesSearchText(answer.studentName, query))
  .sort((first, second) => {
    const nameOrder = first.studentName.localeCompare(second.studentName, "ru-RU");
    if (sort === "name") return nameOrder || first.id.localeCompare(second.id);
    const timeOrder = sentAt(first) - sentAt(second);
    if (sort === "queue") {
      const statusOrder = priority[getSubmissionStatus(first) ?? "submitted"] - priority[getSubmissionStatus(second) ?? "submitted"];
      if (statusOrder) return statusOrder;
    }
    return (sort === "newest" ? -timeOrder : timeOrder) || nameOrder || first.id.localeCompare(second.id);
  });

export const getNextReviewSubmission = (answers: Submission[], currentId?: string | null, query = "", sort: ReviewSort = "queue") => {
  const queue = getReviewSubmissions(answers, "submitted", query, sort);
  const index = queue.findIndex((answer) => answer.id === currentId);
  if (index < 0) return queue[0] ?? null;
  if (queue.length === 1) return null;
  return queue[(index + 1) % queue.length];
};
