import { getJournalHrefById } from "../data/academicCatalog";
import type { Assignment } from "../data/assignmentStore";

export type JournalSection = "journal" | "assignments" | "materials" | "history";

export const getJournalSection = (params: URLSearchParams, allowHistory = false): JournalSection => {
  const tab = params.get("tab");
  if (tab === "journal" || tab === "assignments" || tab === "materials" || (tab === "history" && allowHistory)) return tab;
  return params.get("assignment") ? "assignments" : "journal";
};

export const changeJournalSection = (params: URLSearchParams, section: string) => {
  const next = new URLSearchParams(params);
  if (section === "journal") next.delete("tab");
  else next.set("tab", section);
  next.delete("assignment");
  next.delete("submission");
  return next;
};

export const getAssignmentHref = (assignment: Pick<Assignment, "id" | "subjectId" | "groupId">, submissionId?: string) => {
  const journal = getJournalHrefById(assignment.subjectId, assignment.groupId);
  if (journal === "/journal") return journal;
  const params = new URLSearchParams({ tab: "assignments", assignment: assignment.id });
  if (submissionId) params.set("submission", submissionId);
  return `${journal}?${params}`;
};
