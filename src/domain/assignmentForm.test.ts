import { describe, expect, it } from "vitest";
import { getAssignmentFormError, getAssignmentVisibility, type AssignmentForm } from "./assignmentForm";

const memberships = [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }];
const form: AssignmentForm = { title: "Практическая работа", description: "Решите задачи", subject: "Теория вероятностей", group: "112-МКо", lessonDate: "2026-10-10T09:00", deadline: "2026-10-12T23:59", lessonType: "Практика", status: "published", allowLateSubmissions: false };
describe("assignment publication validation", () => {
  it("accepts a complete assigned task", () => expect(getAssignmentFormError(form, memberships)).toBe(""));
  it.each(["title", "description"] as const)("rejects whitespace-only %s", (field) => expect(getAssignmentFormError({ ...form, [field]: "  \n  " }, memberships)).toContain("не только пробелы"));
  it.each(["lessonDate", "deadline"] as const)("rejects an unset %s", (field) => expect(getAssignmentFormError({ ...form, [field]: "" }, memberships)).toContain("Выберите дату"));
  it("rejects a deadline before the lesson", () => expect(getAssignmentFormError({ ...form, deadline: "2026-10-09T23:59" }, memberships)).toContain("раньше даты"));
  it("does not let a teacher save to an unassigned group", () => expect(getAssignmentFormError({ ...form, group: "113-МКо" }, memberships)).toContain("не назначены"));
  it("describes the actual visibility and acceptance rules for each status", () => {
    expect(getAssignmentVisibility("draft")).toContain("только преподавателю");
    expect(getAssignmentVisibility("published")).toContain("отправлять ответы");
    expect(getAssignmentVisibility("closed")).toContain("не принимаются");
    expect(getAssignmentVisibility("archived")).toContain("не будет видно студентам");
  });
});
