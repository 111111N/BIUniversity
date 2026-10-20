import { describe, expect, it } from "vitest";
import type { Assignment, Submission } from "../data/assignmentStore";
import { getStudentDashboardTasks } from "./dashboardAssignments";

const now = new Date("2026-10-10T12:00:00");
const memberships = [{ subjectId: "data-analysis", groupIds: ["112-mko"] }];
const task = (overrides: Partial<Assignment> = {}): Assignment => ({
  id: "task-1", subjectId: "data-analysis", groupId: "112-mko", subject: "Анализ данных", group: "112-МКо",
  title: "Работа", description: "Описание", lessonDate: "2026-10-09T09:00", lessonType: "Практика",
  deadline: "2026-10-11T18:00", status: "published", allowLateSubmissions: false,
  createdAt: "2026-10-01T10:00", updatedAt: "2026-10-01T10:00", ...overrides,
});
const answer = (overrides: Partial<Submission> = {}): Submission => ({
  id: "answer-1", assignmentId: "task-1", studentId: "student-1", studentName: "Студент",
  sentAt: "2026-10-09T10:00", updatedAt: "2026-10-09T10:00", text: "Ответ", status: "submitted", ...overrides,
});
const tasks = (assignments: Assignment[], answers: Submission[] = []) => getStudentDashboardTasks(assignments, answers, memberships, "student-1", now);

describe("student dashboard assignments", () => {
  it("checks both subject and group IDs and hides drafts and archives", () => {
    const assignments = [task(), task({ id: "other-group", groupId: "113-mko" }), task({ id: "other-subject", subjectId: "theory-of-probability" }), task({ id: "draft", status: "draft" }), task({ id: "archive", status: "archived" })];
    expect(tasks(assignments).map((item) => item.id)).toEqual(["task-1"]);
  });

  it("does not count a timely submitted answer as overdue after its deadline", () => {
    const [item] = tasks([task({ deadline: "2026-10-09T18:00" })], [answer()]);
    expect(item.state).toBe("submitted");
    expect(item.overdue).toBe(false);
    expect(item.canSubmit).toBe(false);
    expect(item.deadline).not.toContain("Просрочено");
    expect(item.action).toBe("Посмотреть ответ");
  });

  it("keeps closed work available for reading without asking for an answer", () => {
    const [item] = tasks([task({ status: "closed" })]);
    expect(item.tag).toBe("Приём завершён");
    expect(item.canSubmit).toBe(false);
    expect(item.href).toContain("assignment=task-1");
  });

  it("takes the latest attempt status and ignores other students' answers", () => {
    const revised = answer({ attempts: [{ id: "attempt-1", number: 1, sentAt: "2026-10-09T10:00", updatedAt: "2026-10-10T10:00", text: "Ответ", status: "revision", submittedLate: false, teacherComment: "Исправьте расчёт" }] });
    const [item] = tasks([task()], [revised, answer({ studentId: "other-student", status: "graded", grade: "5" })]);
    expect(item.state).toBe("revision");
    expect(item.canSubmit).toBe(true);
    expect(item.action).toBe("Исправить ответ");
  });

  it("prioritizes actionable work and respects the late-submission setting", () => {
    const items = tasks([task({ id: "closed", deadline: "2026-10-01T18:00", status: "closed" }), task({ id: "late", deadline: "2026-10-08T18:00", allowLateSubmissions: true }), task()]);
    expect(items.map((item) => item.id)).toEqual(["late", "task-1", "closed"]);
    expect(items[0].canSubmit).toBe(true);
    expect(items[0].state).toBe("late-allowed");
    expect(tasks([task({ deadline: "2026-10-08T18:00" })])[0].canSubmit).toBe(false);
  });
});
