import { describe, expect, it } from "vitest";
import type { Assignment, Submission } from "../data/assignmentStore";
import { getStudentAssignmentLabel, indexAssignmentSubmissions, matchesAssignmentView, selectAssignmentList } from "./assignmentViews";

const now = new Date("2026-10-20T12:00:00");
const task = (id: string, status: Assignment["status"] = "published"): Assignment => ({ id, status, subjectId: "math", groupId: "g", subject: "Математика", group: "Группа", title: id, description: "Условие", lessonDate: "2026-10-19T12:00", lessonType: "Практика", deadline: "2026-10-21T12:00", allowLateSubmissions: false, createdAt: "2026-10-18T12:00", updatedAt: "2026-10-18T12:00" });
const answer = (assignmentId: string, status: Submission["status"] = "submitted"): Submission => ({ id: assignmentId, assignmentId, studentId: "me", studentName: "Анна", status, text: "Ответ", sentAt: "2026-10-20T10:00", updatedAt: "2026-10-20T10:00" });

describe("assignment workspace views", () => {
  it("separates task lifecycle from the review queue without duplicating submissions", () => {
    const tasks = [task("open"), task("closed", "closed"), task("draft", "draft"), task("archived", "archived")];
    const indexes = indexAssignmentSubmissions([answer("open"), answer("open", "graded"), answer("closed")], "me");
    expect(selectAssignmentList(tasks, indexes, "current", "", "deadline", now).map((item) => item.id)).toEqual(["closed", "open"]);
    expect(selectAssignmentList(tasks, indexes, "review", "", "deadline", now).map((item) => item.id)).toEqual(["closed", "open"]);
    expect(indexes.pending.get("open")).toBe(1);
    expect(selectAssignmentList(tasks, indexes, "drafts", "", "deadline", now).map((item) => item.id)).toEqual(["draft"]);
    expect(selectAssignmentList(tasks, indexes, "archive", "", "deadline", now).map((item) => item.id)).toEqual(["archived"]);
  });
  it("prioritizes actionable student work without concealing closed work in All", () => {
    expect(matchesAssignmentView(task("open"), "todo", 0, undefined, now)).toBe(true);
    expect(matchesAssignmentView(task("open"), "todo", 0, answer("open"), now)).toBe(false);
    expect(matchesAssignmentView(task("open"), "todo", 0, answer("open", "revision"), now)).toBe(true);
    expect(matchesAssignmentView(task("closed", "closed"), "todo", 0, answer("closed", "revision"), now)).toBe(false);
    expect(matchesAssignmentView(task("closed", "closed"), "all", 0, undefined, now)).toBe(true);
    expect(matchesAssignmentView(task("open"), "results", 0, answer("open", "graded"), now)).toBe(true);
  });
  it("combines search and sort without mutating the source list", () => {
    const source = [{ ...task("B"), title: "Практика по вероятности", deadline: "2026-10-22T12:00" }, { ...task("A"), title: "Вероятность: практика" }];
    const indexes = indexAssignmentSubmissions([], "me");
    expect(selectAssignmentList(source, indexes, "current", "практика вероят", "deadline", now).map((item) => item.id)).toEqual(["A", "B"]);
    expect(source.map((item) => item.id)).toEqual(["B", "A"]);
  });
  it("preserves late admission and a revision's closed state in student labels", () => {
    const past = { ...task("past"), deadline: "2026-10-19T12:00" };
    expect(getStudentAssignmentLabel(past, undefined, now)).toBe("Приём закрыт");
    expect(getStudentAssignmentLabel({ ...past, allowLateSubmissions: true }, undefined, now)).toBe("Можно сдать с опозданием");
    expect(getStudentAssignmentLabel(past, answer("past", "revision"), now)).toBe("Доработка · приём закрыт");
  });
});
