import { isAssignmentWorkView } from "./submissionReviewNavigation";

export interface AssignmentOperationFeedback {
  scope: string;
  kind: "success" | "error";
  message: string;
}

export const getAssignmentFeedbackScope = (params: URLSearchParams, identity: string) => JSON.stringify([
  identity,
  params.get("assignment"),
  params.get("submission"),
  params.get("editor"),
  params.get("publish") === "1",
  isAssignmentWorkView(params),
]);

export const retainAssignmentFeedback = (feedback: AssignmentOperationFeedback | null, scope: string) => feedback?.scope === scope ? feedback : null;
