import { describe, expect, it } from "vitest";
import { changeAssignmentSelection, changeJournalSection } from "./journalNavigation";
import { changeAssignmentWorkView, changeSubmissionReviewView, clearSubmissionReviewView, isAssignmentWorkView, readSubmissionReviewView, selectReviewSubmission } from "./submissionReviewNavigation";

const working = () => new URLSearchParams("tab=assignments&assignment=task&submission=anna&assignmentTab=work&reviewFilter=revision&reviewSearch=Анна&reviewSort=name&reviewPane=list&tasks=review&taskSearch=теория");

describe("submission review navigation", () => {
  it("defaults to the review queue and mobile list, opening a direct answer link without an extra flag", () => {
    expect(readSubmissionReviewView(new URLSearchParams())).toEqual({ filter: "submitted", query: "", sort: "queue", pane: "list" });
    const link = new URLSearchParams("assignment=task&submission=anna");
    expect(isAssignmentWorkView(link)).toBe(true);
    expect(readSubmissionReviewView(link).pane).toBe("answer");
  });

  it("keeps search, order, selected student and mobile list when reading the condition and returning", () => {
    const initial = working();
    const condition = changeAssignmentWorkView(initial, false);
    expect(isAssignmentWorkView(condition)).toBe(false);
    expect(condition.get("submission")).toBe("anna");
    expect(readSubmissionReviewView(condition)).toEqual(readSubmissionReviewView(initial));
    const returned = changeAssignmentWorkView(condition, true);
    expect(isAssignmentWorkView(returned)).toBe(true);
    expect(returned.toString()).toBe(initial.toString());
    expect(initial.get("assignmentTab")).toBe("work");
  });

  it("updates only the requested controls without touching the assignment list or selected work", () => {
    const initial = working();
    const next = changeSubmissionReviewView(initial, { query: "Иван", sort: "newest" });
    expect(readSubmissionReviewView(next)).toEqual({ filter: "revision", query: "Иван", sort: "newest", pane: "list" });
    expect(next.get("assignment")).toBe("task");
    expect(next.get("submission")).toBe("anna");
    expect(next.get("tasks")).toBe("review");
    expect(next.get("taskSearch")).toBe("теория");
    expect(initial.get("reviewSearch")).toBe("Анна");
  });

  it("selects the next answer and opens its pane without resetting filters", () => {
    const next = selectReviewSubmission(working(), "ivan");
    expect(next.get("submission")).toBe("ivan");
    expect(isAssignmentWorkView(next)).toBe(true);
    expect(readSubmissionReviewView(next)).toEqual({ filter: "revision", query: "Анна", sort: "name", pane: "answer" });
    const list = changeSubmissionReviewView(next, { pane: "list" });
    expect(list.get("submission")).toBe("ivan");
    expect(readSubmissionReviewView(list).pane).toBe("list");
  });

  it.each(["all", "submitted", "revision", "graded", "missing"] as const)("restores the %s filter", (filter) => {
    const next = changeSubmissionReviewView(working(), { filter });
    expect(readSubmissionReviewView(next).filter).toBe(filter);
  });

  it.each(["queue", "newest", "oldest", "name"] as const)("restores the %s order", (sort) => {
    expect(readSubmissionReviewView(changeSubmissionReviewView(working(), { sort })).sort).toBe(sort);
  });

  it("normalizes unknown URL values and keeps query text as data", () => {
    const unknown = new URLSearchParams("submission=anna&reviewFilter=admin&reviewSort=bad&reviewPane=bad");
    expect(readSubmissionReviewView(unknown)).toEqual({ filter: "submitted", query: "", sort: "queue", pane: "answer" });
    const query = 'Ёлкин & Иван ? <student> "quoted"';
    const encoded = changeSubmissionReviewView(working(), { query }).toString();
    expect(readSubmissionReviewView(new URLSearchParams(encoded)).query).toBe(query);
  });

  it("removes empty/default options without clearing unrelated state", () => {
    const next = changeSubmissionReviewView(working(), { filter: "submitted", query: "", sort: "queue", pane: "answer" });
    for (const key of ["reviewFilter", "reviewSearch", "reviewSort", "reviewPane"]) expect(next.has(key)).toBe(false);
    expect(next.get("submission")).toBe("anna");
    expect(next.get("tasks")).toBe("review");
  });

  it("does not carry one assignment's student search into another assignment or journal section", () => {
    const initial = working();
    for (const next of [changeAssignmentSelection(initial, "other"), changeAssignmentSelection(initial, null), changeJournalSection(initial, "materials"), clearSubmissionReviewView(initial)]) {
      for (const key of ["reviewFilter", "reviewSearch", "reviewSort", "reviewPane"]) expect(next.has(key)).toBe(false);
      expect(next.get("taskSearch")).toBe("теория");
    }
    expect(initial.get("reviewSearch")).toBe("Анна");
  });
});
