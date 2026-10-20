import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Submission } from "../../../data/assignmentStore";
import SubmissionWorkspace from ".";

const render = (answers: Submission[], rosterError = "") => renderToStaticMarkup(<SubmissionWorkspace answers={answers} students={[]} rosterError={rosterError} currentId={null} targetRef={createRef()} saving={false} drafts={{}} onDraftChange={() => {}} onSelect={() => {}} onReview={() => true} />);
const answer: Submission = { id: "one", studentId: "anna", studentName: "Анна", assignmentId: "task", text: "Ответ", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T12:00", status: "revision", teacherComment: "Исправить" };

describe("submission workspace", () => {
  it("shows a useful empty state without an empty queue", () => {
    const markup = render([]);
    expect(markup).toContain("Ответов пока нет");
    expect(markup).not.toContain("Очередь проверки");
  });

  it("counts revision as considered, not as graded, and hides start when no pending answers", () => {
    const markup = render([answer]);
    expect(markup).toContain("Новых работ для проверки нет");
    expect(markup).toContain('value="1"');
    expect(markup).not.toContain("Начать проверку");
    expect(markup).toContain("На доработке");
  });

  it("does not invent a missing-student count when the roster fails", () => {
    const markup = render([], "storage failure");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("Ещё не сдали");
  });
});
