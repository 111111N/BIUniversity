import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Submission } from "../../../data/assignmentStore";
import SubmissionCard from ".";

const answer: Submission = { id: "answer-1", assignmentId: "task-1", studentId: "anna-smirnova", studentName: "Анна Смирнова", text: "Решение задачи", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T13:00", status: "submitted" };
const render = (submission: Submission, saving = false) => renderToStaticMarkup(<SubmissionCard submission={submission} expanded comment="" grade="" saving={saving} onCommentChange={() => {}} onGradeChange={() => {}} onReview={() => {}} />);

describe("submission card", () => {
  it("shows the review form only for an awaiting answer", () => {
    const markup = render(answer);
    expect(markup).toContain("<textarea");
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("Сохранить оценку");
    expect(markup).toContain('aria-label="Ответ: Анна Смирнова"');
  });

  it.each(["5", "4", "3", "2"])("shows grade %s as a result, without a disabled form", (grade) => {
    const markup = render({ ...answer, status: "graded", grade, teacherComment: "Отлично оформлено" });
    expect(markup).toContain(`aria-label="Оценка ${grade}"`);
    expect(markup).toContain("Отлично оформлено");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain('role="combobox"');
    expect(markup).not.toContain("Сохранить оценку");
  });

  it("shows revision feedback instead of inactive review controls", () => {
    const markup = render({ ...answer, status: "revision", teacherComment: "Исправьте формулу" });
    expect(markup).toContain("Исправьте формулу");
    expect(markup).toContain("Ожидается новая попытка студента");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("Сохранить оценку");
  });

  it.each([true, false])("offers an explicit save-and-advance action (has next: %s)", (hasNext) => {
    const markup = renderToStaticMarkup(<SubmissionCard submission={answer} expanded comment="" grade="" saving={false} onCommentChange={() => {}} onGradeChange={() => {}} onReview={() => {}} onReviewNext={() => {}} hasNext={hasNext} />);
    expect(markup).toContain(hasNext ? "Сохранить оценку и открыть следующий ответ" : "Сохранить оценку и завершить очередь");
    expect(markup).toContain("Сохранить оценку");
    expect(markup).toMatch(/disabled="" aria-label="Сохранить оценку и/);
  });
});
