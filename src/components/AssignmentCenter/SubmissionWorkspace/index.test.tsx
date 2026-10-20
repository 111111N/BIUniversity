import { createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Submission } from "../../../data/assignmentStore";
import SubmissionWorkspace from ".";

const render = (answers: Submission[], props: Partial<ComponentProps<typeof SubmissionWorkspace>> = {}) => renderToStaticMarkup(<SubmissionWorkspace answers={answers} students={[]} rosterError="" currentId={null} targetRef={createRef()} saving={false} drafts={{}} onDraftChange={() => {}} onSelect={() => {}} onReview={() => true} {...props} />);
const answer: Submission = { id: "one", studentId: "anna", studentName: "Анна", assignmentId: "task", text: "Первый ответ", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T12:00", status: "revision", teacherComment: "Исправить" };
const pending: Submission = { ...answer, id: "two", studentId: "ivan", studentName: "Иван", status: "submitted", text: "Второй ответ" };

describe("submission workspace", () => {
  it("shows a useful empty state without an empty queue", () => {
    const markup = render([]);
    expect(markup).toContain("Ответов пока нет");
    expect(markup).not.toContain("Очередь проверки");
    expect(markup).not.toContain('data-submission-id=');
  });

  it("counts revision as considered without marking it graded", () => {
    const markup = render([answer]);
    expect(markup).toContain("Новых работ для проверки нет");
    expect(markup).toContain("Рассмотрено 1 / 1");
    expect(markup).toContain('value="1"');
    expect(markup).toContain("На доработке");
    expect(markup).not.toContain("Сохранить и далее");
  });

  it("shows roster errors without inventing a missing-student count", () => {
    const markup = render([], { rosterError: "storage failure" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Список несдавших временно недоступен");
    expect(markup).toMatch(/Не сдали<span>—<\/span>/);
    expect(markup).not.toMatch(/Не сдали<span>0<\/span>/);
  });

  it("renders exactly one answer, selecting a pending work before reviewed work", () => {
    const markup = render([answer, pending]);
    expect(markup.match(/data-submission-id=/g)).toHaveLength(1);
    expect(markup).toContain('data-submission-id="two"');
    expect(markup).toContain("Второй ответ");
    expect(markup).not.toContain("Первый ответ");
    expect(markup).not.toContain("Раскрыть ответ");
    expect(markup).not.toContain("Свернуть ответ");
    expect(markup).toContain("К списку работ");
  });

  it("opens a linked answer even when the initial submitted filter excludes it", () => {
    const markup = render([answer, pending], { currentId: answer.id, initialFilter: "submitted" });
    expect(markup).toContain('data-submission-id="one"');
    expect(markup).toContain("Первый ответ");
    expect(markup).toContain("Выбранная работа вне текущего списка");
    expect(markup).not.toContain("Второй ответ");
    expect(markup).toMatch(/aria-pressed="true"[^>]*>На проверке/);
  });

  it("restores the draft for the selected attempt without displaying another student's draft", () => {
    const markup = render([pending], {
      drafts: { "two-attempt-1": { comment: "Сохранённый черновик", grade: "4" }, other: { comment: "Чужой черновик", grade: "2" } },
    });
    expect(markup).toContain("Сохранённый черновик");
    expect(markup).not.toContain("Чужой черновик");
    expect(markup).toMatch(/type="radio"[^>]*aria-label="Оценка 4 для Иван"[^>]*checked=""/);
    expect(markup).toContain("Есть черновик");
  });

  it("keeps missing students in a separate list mode instead of a long block after answers", () => {
    const markup = render([pending], { students: [{ id: "missing", name: "Не сдавший студент", attendance: {}, grades: {} }] });
    expect(markup).toMatch(/Не сдали<span>1<\/span>/);
    expect(markup).not.toContain("Не сдавший студент");
    expect(markup).not.toContain("Ещё не сдали");
  });
});
