import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Submission, SubmissionAttempt } from "../../../data/assignmentStore";
import SubmissionCard from ".";

const answer: Submission = { id: "answer-1", assignmentId: "task-1", studentId: "anna-smirnova", studentName: "Анна Смирнова", text: "Решение задачи", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T13:00", status: "submitted" };
const render = (submission: Submission, saving = false, comment = "", grade = "") => renderToStaticMarkup(<SubmissionCard submission={submission} comment={comment} grade={grade} saving={saving} onCommentChange={() => {}} onGradeChange={() => {}} onReview={() => {}} onReviewNext={() => {}} />);

describe("submission card", () => {
  it("shows the current answer immediately, with explicit grade choices instead of an accordion", () => {
    const markup = render(answer);
    expect(markup).toContain("Решение задачи");
    expect(markup).toContain("<textarea");
    expect(markup.match(/type="radio"/g)).toHaveLength(4);
    for (const grade of ["2", "3", "4", "5"]) expect(markup).toContain(`Оценка ${grade} для Анна Смирнова`);
    expect(markup).toContain('aria-label="Ответ: Анна Смирнова"');
    expect(markup).not.toContain('aria-expanded=');
    expect(markup).not.toContain('role="combobox"');
  });

  it.each(["5", "4", "3", "2"])("shows grade %s as a result without an inactive review form", (grade) => {
    const markup = render({ ...answer, status: "graded", grade, teacherComment: "Отлично оформлено" });
    expect(markup).toContain(`aria-label="Оценка ${grade}"`);
    expect(markup).toContain("Отлично оформлено");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain('type="radio"');
    expect(markup).not.toContain("Сохранить и далее");
  });

  it("shows revision feedback instead of inactive review controls", () => {
    const markup = render({ ...answer, status: "revision", teacherComment: "Исправьте формулу" });
    expect(markup).toContain("Исправьте формулу");
    expect(markup).toContain("Ожидается новая попытка студента");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("Сохранить и далее");
  });

  it.each([true, false])("offers save-and-advance and regular saving (has next: %s)", (hasNext) => {
    const markup = renderToStaticMarkup(<SubmissionCard submission={answer} comment="" grade="5" saving={false} onCommentChange={() => {}} onGradeChange={() => {}} onReview={() => {}} onReviewNext={() => {}} hasNext={hasNext} />);
    expect(markup).toContain(hasNext ? "Сохранить и далее: следующий ответ" : "Сохранить и далее: завершить очередь");
    expect(markup).toMatch(/<button[^>]*>Сохранить<\/button>/);
    expect(markup).not.toMatch(/disabled=""[^>]*aria-label="Сохранить и далее/);
  });

  it("requires a grade for saving and a nonblank comment for returning", () => {
    expect(render(answer)).toMatch(/<button[^>]*disabled=""[^>]*>Вернуть на доработку/);
    expect(render(answer, false, "   ")).toMatch(/<button[^>]*disabled=""[^>]*>Вернуть на доработку/);
    expect(render(answer, false, "Исправить")).not.toMatch(/<button[^>]*disabled=""[^>]*>Вернуть на доработку/);
    expect(render(answer, false, "", "1")).toMatch(/disabled="" aria-label="Сохранить и далее/);
    expect(render(answer, true, "Исправить", "5")).toContain('<fieldset disabled=""');
  });

  it("keeps previous attempts collapsed while showing the current answer and late status", () => {
    const first: SubmissionAttempt = { id: "first", number: 1, sentAt: answer.sentAt, updatedAt: answer.updatedAt, status: "revision", text: "Старое решение", submittedLate: false, teacherComment: "Уточнить" };
    const current: SubmissionAttempt = { ...first, id: "second", number: 2, status: "submitted", text: "Новое решение", submittedLate: true };
    const markup = render({ ...answer, attempts: [first, current] });
    expect(markup).toContain("Новое решение");
    expect(markup).toContain("После дедлайна");
    expect(markup).toContain("Предыдущие попытки · 1");
    expect(markup).toMatch(/<details[^>]*><summary>Предыдущие попытки/);
    expect(markup).not.toMatch(/<details[^>]*open/);
    expect(markup).toContain("Старое решение");
    expect(markup).toContain("Уточнить");
  });
});
