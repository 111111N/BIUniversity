import { describe, expect, it } from "vitest";
import { changeAssignmentSelection } from "./journalNavigation";
import { getAssignmentFeedbackScope, retainAssignmentFeedback, type AssignmentOperationFeedback } from "./assignmentFeedback";

const identity = JSON.stringify(["teacher-one", "teacher", "Математика", "112-МКо"]);
const scope = (search: string, user = identity) => getAssignmentFeedbackScope(new URLSearchParams(search), user);
const review = "tab=assignments&assignment=one&submission=anna&assignmentTab=work";
const feedback: AssignmentOperationFeedback = { scope: scope(review), kind: "error", message: "Решение не сохранено. Комментарий оставлен в форме." };

describe("assignment operation feedback context", () => {
  it.each([
    "tab=assignments&assignment=two&submission=anna&assignmentTab=work",
    "tab=assignments&assignment=one&submission=ivan&assignmentTab=work",
    "tab=assignments&assignment=one",
    "tab=assignments",
    "tab=assignments&assignment=one&editor=edit",
    "tab=assignments&editor=new",
  ])("does not show another assignment, answer or editor's result: %s", (next) => {
    expect(retainAssignmentFeedback(feedback, scope(next))).toBeNull();
  });

  it("preserves feedback while filters, search, sorting and unrelated UI parameters change", () => {
    const next = review + "&taskSearch=теория&taskSort=newest&tasks=review&notifications=open&period=autumn&reviewSearch=Анна&reviewFilter=graded&reviewSort=name&reviewPane=list";
    expect(retainAssignmentFeedback(feedback, scope(next))).toBe(feedback);
  });

  it("treats an answer link as the work tab even without an explicit assignmentTab", () => {
    expect(retainAssignmentFeedback(feedback, scope("assignment=one&submission=anna"))).toBe(feedback);
  });

  it("does not display review feedback on the condition tab even when the selected answer is retained", () => {
    expect(retainAssignmentFeedback(feedback, scope("assignment=one&submission=anna&assignmentTab=condition"))).toBeNull();
  });

  it.each([
    ["teacher-two", "teacher", "Математика", "112-МКо"],
    ["teacher-one", "student", "Математика", "112-МКо"],
    ["teacher-one", "teacher", "Физика", "112-МКо"],
    ["teacher-one", "teacher", "Математика", "113-МКо"],
  ])("does not reuse feedback across user, role or journal context (%#)", (...context) => {
    expect(retainAssignmentFeedback(feedback, scope(review, JSON.stringify(context)))).toBeNull();
  });

  it("separates editing and publication confirmation for the same task", () => {
    const editing = "assignment=one&editor=edit";
    const result: AssignmentOperationFeedback = { ...feedback, scope: scope(editing) };
    expect(retainAssignmentFeedback(result, scope(editing + "&publish=1"))).toBeNull();
  });

  it.each(["new", "edit"])("preserves successful saving in its destination instead of the %s editor", (editor) => {
    const current = new URLSearchParams(`assignment=one&submission=anna&assignmentTab=work&editor=${editor}&publish=1&taskSearch=теория&tasks=current`);
    const destination = changeAssignmentSelection(current, "saved");
    const result: AssignmentOperationFeedback = { scope: getAssignmentFeedbackScope(destination, identity), kind: "success", message: "Задание сохранено." };
    expect(retainAssignmentFeedback(result, scope("assignment=saved&taskSearch=теория&tasks=current"))).toBe(result);
    expect(retainAssignmentFeedback(result, getAssignmentFeedbackScope(current, identity))).toBeNull();
  });

  it("keeps successful deletion in the filtered list and retires it after leaving that context", () => {
    const list = changeAssignmentSelection(new URLSearchParams(review + "&tasks=review&taskSearch=теория"), null);
    const result: AssignmentOperationFeedback = { scope: getAssignmentFeedbackScope(list, identity), kind: "success", message: "Задание и ответы удалены." };
    const listScope = scope("tasks=review&taskSearch=теория");
    expect(retainAssignmentFeedback(result, listScope)).toBe(result);
    const retired = retainAssignmentFeedback(result, scope("assignment=two"));
    expect(retired).toBeNull();
    expect(retainAssignmentFeedback(retired, listScope)).toBeNull();
  });

  it("does not display an async completion in the different task currently open", () => {
    const result: AssignmentOperationFeedback = { scope: scope("assignment=one"), kind: "success", message: "Ответ отправлен преподавателю." };
    expect(retainAssignmentFeedback(result, scope("assignment=two"))).toBeNull();
    expect(retainAssignmentFeedback(result, scope("assignment=one"))).toBe(result);
  });

  it("keeps IDs containing separators distinct", () => {
    expect(scope("assignment=one%26submission%3Danna")).not.toBe(scope("assignment=one&submission=anna"));
  });
});
