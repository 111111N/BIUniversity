import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Submission, SubmissionAttempt } from "../../../data/assignmentStore";
import SubmissionCard from ".";

const answer: Submission = { id: "answer-1", assignmentId: "task-1", studentId: "anna-smirnova", studentName: "Анна Смирнова", text: "Решение задачи", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T13:00", status: "submitted" };
const render = (submission: Submission, saving = false, comment = "", grade = "", unavailableReason?: string) => renderToStaticMarkup(<SubmissionCard submission={submission} comment={comment} grade={grade} saving={saving} unavailableReason={unavailableReason} onCommentChange={() => {}} onGradeChange={() => {}} onReview={() => {}} onReviewNext={() => {}} />);

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

  it("keeps the entire current answer open even when it is very long", () => {
    const text = `${"Подробный расчёт. ".repeat(300)}Последний вывод.`;
    const markup = render({ ...answer, text });
    expect(markup).toContain(text);
    expect(markup).not.toContain("Читать ответ полностью");
    expect(markup).not.toContain("aria-expanded=");
    expect(markup).toContain("Сохранить и далее");
  });

  it("offers expansion only for the long previous answer without hiding its attachment or feedback", () => {
    const previous: SubmissionAttempt = { id: "previous", number: 1, text: "Строка ответа\n".repeat(9), status: "revision", teacherComment: "Уточните последний вывод", sentAt: answer.sentAt, updatedAt: answer.updatedAt, submittedLate: false, attachmentId: "old-file", attachmentName: "previous.pdf" };
    const current: SubmissionAttempt = { ...previous, id: "current", number: 2, text: "Исправленный ответ", status: "submitted", attachmentId: undefined, attachmentName: undefined, teacherComment: undefined };
    const markup = render({ ...answer, attempts: [previous, current] });
    expect(markup).toContain(current.text);
    expect(markup).toContain(previous.text);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(1);
    const history = markup.slice(markup.indexOf("<details"));
    expect(history).toContain("Читать ответ полностью");
    expect(history).toContain("Скачать файл previous.pdf");
    expect(history).toContain(previous.teacherComment);
    const controls = history.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeTruthy();
    expect(history).toContain(`<p id="${controls}"`);
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

  it("keeps an unavailable review copyable without pretending that it is saving", () => {
    const markup = render(answer, false, "Исправить формулу", "4", "Не удалось прочитать хранилище.");
    const textarea = markup.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(markup).toContain('aria-busy="false"');
    expect(markup).not.toContain("Сохраняем");
    expect(markup).toContain("Сохранение недоступно. Не удалось прочитать хранилище.");
    expect(markup).toContain("Решение не сохранено.");
    expect(markup).toContain("Текст можно выделить и скопировать.");
    expect(textarea).toContain('readOnly=""');
    expect(textarea).not.toContain("disabled=");
    expect(markup).toContain("Исправить формулу</textarea>");
    const selectedGrade = markup.match(/<input[^>]*aria-label="Оценка 4 для Анна Смирнова"[^>]*>/)?.[0] ?? "";
    expect(selectedGrade).toContain('checked=""');
    expect(selectedGrade).toContain('value="4"');
    expect(markup).toContain('<fieldset disabled=""');
    expect(markup.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    const describedBy = textarea.match(/aria-describedby="([^"]+)"/)?.[1].split(" ") ?? [];
    expect(describedBy).toHaveLength(2);
    for (const id of describedBy) expect(markup).toContain(`id="${id}"`);
  });

  it("explains unavailable saving even before a review draft exists", () => {
    const markup = render(answer, false, "", "", "Ошибка чтения.");
    expect(markup).toContain("Сохранение недоступно. Ошибка чтения.");
    expect(markup).not.toContain("Решение не сохранено.");
    expect(markup).not.toContain("Сохраняем");
    expect(markup).toContain('readOnly=""');
  });

  it("uses the busy state only for an actual save even if storage becomes unavailable", () => {
    const markup = render(answer, true, "Исправить", "4", "Ошибка чтения.");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Сохраняем решение…");
    expect(markup).toMatch(/<textarea[^>]*disabled=""/);
  });

  it("allows editing and saving an existing draft when storage is available", () => {
    const markup = render(answer, false, "Исправить", "4");
    const textarea = markup.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(textarea).not.toContain("readOnly=");
    expect(textarea).not.toContain("disabled=");
    expect(markup).not.toContain("Сохранение недоступно");
    expect(markup).not.toMatch(/<button[^>]*disabled=/);
    expect(markup).toContain("Студент пока его не видит.");
  });

  it("does not describe a saved result as an unsaved review during a storage error", () => {
    const markup = render({ ...answer, status: "graded", grade: "5", teacherComment: "Проверено" }, false, "", "", "Ошибка чтения.");
    expect(markup).toContain('aria-label="Оценка 5"');
    expect(markup).not.toContain("Сохранение недоступно");
    expect(markup).not.toContain("<textarea");
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
    expect(markup).toContain("Результат предыдущей попытки");
    expect(markup).not.toContain("Ожидается новая попытка");
  });
});
