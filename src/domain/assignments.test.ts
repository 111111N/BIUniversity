import { describe, expect, it } from "vitest";
import type { Assignment, Submission } from "../data/assignmentStore";
import { getStudentAssignmentState, isAssignmentVisibleToStudent, isSubmissionAllowed } from "./assignments";

const assignment = (overrides: Partial<Assignment> = {}): Assignment => ({
  id: "task-1", subjectId: "data-analysis", groupId: "112-mko", subject: "Анализ данных", group: "112-МКо", lessonDate: "2026-09-12T09:00",
  lessonType: "Практика", title: "Работа", description: "Описание", deadline: "2026-09-20T18:00",
  status: "published", allowLateSubmissions: false, createdAt: "2026-09-10T10:00", updatedAt: "2026-09-10T10:00",
  ...overrides,
});

const submission = (overrides: Partial<Submission> = {}): Submission => ({
  id: "answer-1", assignmentId: "task-1", studentId: "student-1", studentName: "Анна Смирнова",
  sentAt: "2026-09-19T12:00", updatedAt: "2026-09-19T12:00", text: "Ответ", status: "submitted", ...overrides,
});

describe("assignment rules", () => {
  const beforeDeadline = new Date("2026-09-19T12:00:00");
  const afterDeadline = new Date("2026-09-21T12:00:00");

  it("shows only published or closed tasks for the student's group", () => {
    expect(isAssignmentVisibleToStudent(assignment(), "112-МКо")).toBe(true);
    expect(isAssignmentVisibleToStudent(assignment({ status: "closed" }), "112-МКо")).toBe(true);
    expect(isAssignmentVisibleToStudent(assignment({ status: "draft" }), "112-МКо")).toBe(false);
    expect(isAssignmentVisibleToStudent(assignment(), "113-МКо")).toBe(false);
  });

  it("respects publication, deadline and late submission settings", () => {
    expect(isSubmissionAllowed(assignment(), beforeDeadline)).toBe(true);
    expect(isSubmissionAllowed(assignment(), afterDeadline)).toBe(false);
    expect(isSubmissionAllowed(assignment({ allowLateSubmissions: true }), afterDeadline)).toBe(true);
    expect(isSubmissionAllowed(assignment({ status: "closed", allowLateSubmissions: true }), beforeDeadline)).toBe(false);
  });

  it("prioritizes an existing answer state over the deadline", () => {
    expect(getStudentAssignmentState(assignment(), submission({ grade: "5", status: "graded" }), afterDeadline)).toBe("graded");
    expect(getStudentAssignmentState(assignment(), submission({ status: "revision" }), afterDeadline)).toBe("revision");
    expect(getStudentAssignmentState(assignment(), submission(), afterDeadline)).toBe("submitted");
  });

  it("distinguishes overdue tasks with and without late submission", () => {
    expect(getStudentAssignmentState(assignment(), undefined, afterDeadline)).toBe("overdue");
    expect(getStudentAssignmentState(assignment({ allowLateSubmissions: true }), undefined, afterDeadline)).toBe("late-allowed");
    expect(getStudentAssignmentState(assignment(), undefined, beforeDeadline)).toBe("pending");
  });
});
