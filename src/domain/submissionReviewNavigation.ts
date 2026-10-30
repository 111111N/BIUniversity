import type { ReviewFilter, ReviewSort } from "./submissionReview";

export interface SubmissionReviewView {
  filter: ReviewFilter | "missing";
  query: string;
  sort: ReviewSort;
  pane: "list" | "answer";
}

export const isAssignmentWorkView = (params: URLSearchParams) => params.get("assignmentTab") !== "condition"
  && (params.get("assignmentTab") === "work" || Boolean(params.get("submission")));

export const changeAssignmentWorkView = (params: URLSearchParams, work: boolean) => {
  const next = new URLSearchParams(params);
  next.set("assignmentTab", work ? "work" : "condition");
  return next;
};

export const selectReviewSubmission = (params: URLSearchParams, submissionId: string) => {
  const next = changeAssignmentWorkView(params, true);
  next.set("submission", submissionId);
  next.delete("reviewPane");
  return next;
};

export const readSubmissionReviewView = (params: URLSearchParams): SubmissionReviewView => {
  const filter = params.get("reviewFilter");
  const sort = params.get("reviewSort");
  return {
    filter: filter === "all" || filter === "revision" || filter === "graded" || filter === "missing" ? filter : "submitted",
    query: params.get("reviewSearch") ?? "",
    sort: sort === "newest" || sort === "oldest" || sort === "name" ? sort : "queue",
    pane: params.get("reviewPane") === "list" || !params.get("submission") ? "list" : "answer",
  };
};

export const changeSubmissionReviewView = (params: URLSearchParams, values: Partial<SubmissionReviewView>) => {
  const next = new URLSearchParams(params);
  const update = (key: string, value: string | undefined) => { if (value) next.set(key, value); else next.delete(key); };
  if (values.filter !== undefined) update("reviewFilter", values.filter === "submitted" ? undefined : values.filter);
  if (values.query !== undefined) update("reviewSearch", values.query);
  if (values.sort !== undefined) update("reviewSort", values.sort === "queue" ? undefined : values.sort);
  if (values.pane !== undefined) update("reviewPane", values.pane === "list" ? "list" : undefined);
  return next;
};

export const clearSubmissionReviewView = (params: URLSearchParams) => {
  const next = new URLSearchParams(params);
  for (const key of ["reviewFilter", "reviewSearch", "reviewSort", "reviewPane"]) next.delete(key);
  return next;
};
