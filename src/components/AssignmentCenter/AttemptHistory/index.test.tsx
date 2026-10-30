import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SubmissionAttempt } from "../../../data/assignmentStore";
import AttemptHistory from ".";

const attempt: SubmissionAttempt = { id: "first", number: 1, text: "Первый ответ", status: "revision", teacherComment: "Исправьте вывод", sentAt: "2026-09-12T12:00", updatedAt: "2026-09-12T13:00", submittedLate: false };

describe("attempt history", () => {
  it("keeps the newest answer visible and earlier attempts in disclosure", () => {
    const markup = renderToStaticMarkup(<AttemptHistory attempts={[attempt, { ...attempt, id: "second", number: 2, text: "Исправленный ответ", status: "submitted", teacherComment: undefined }]} />);
    expect(markup).toContain("Предыдущие попытки");
    expect(markup.indexOf("Исправленный ответ")).toBeLessThan(markup.indexOf("<details"));
    expect(markup.indexOf("Первый ответ")).toBeGreaterThan(markup.indexOf("<details"));
    expect(markup).toContain("Исправьте вывод");
    expect(markup).toContain("Результат предыдущей попытки");
    expect(markup).not.toContain("Ожидается новая попытка");
    expect(markup).not.toContain("<details open");
  });

  it("keeps unnamed attachments accessible in both the current and previous attempt", () => {
    const markup = renderToStaticMarkup(<AttemptHistory attempts={[
      { ...attempt, attachmentId: "previous-file" },
      { ...attempt, id: "second", number: 2, status: "submitted", attachmentId: "current-file", attachmentName: " " },
    ]} />);
    expect(markup.match(/aria-label="Скачать файл Вложение к ответу"/g)).toHaveLength(2);
    expect(markup.indexOf("Скачать файл Вложение к ответу")).toBeLessThan(markup.indexOf("<details"));
    expect(markup.lastIndexOf("Скачать файл Вложение к ответу")).toBeGreaterThan(markup.indexOf("<details"));
  });

  it("does not duplicate the current result when the review panel shows it", () => {
    const graded = { ...attempt, status: "graded" as const, grade: "4" };
    expect(renderToStaticMarkup(<AttemptHistory attempts={[graded]} hideCurrentResult />)).not.toContain('aria-label="Оценка 4"');
    expect(renderToStaticMarkup(<AttemptHistory attempts={[graded]} />)).toContain('aria-label="Оценка 4"');
  });

  it("does not show an empty history for one or zero attempts", () => {
    expect(renderToStaticMarkup(<AttemptHistory attempts={[attempt]} />)).not.toContain("<details");
    expect(renderToStaticMarkup(<AttemptHistory attempts={[]} />)).toBe("");
  });

  it("gives each multiline attempt its own expansion control and preserves the full text", () => {
    const text = Array.from({ length: 9 }, (_, index) => `Строка ${index + 1}`).join("\n");
    const markup = renderToStaticMarkup(<AttemptHistory attempts={[
      { ...attempt, text },
      { ...attempt, id: "second", number: 2, text: `${text}\nВывод <b>остаётся текстом</b>`, status: "submitted" },
    ]} />);
    expect(markup).toContain(text);
    expect(markup).toContain("&lt;b&gt;остаётся текстом&lt;/b&gt;");
    const controls = Array.from(markup.matchAll(/aria-controls="([^"]+)"/g), (match) => match[1]);
    expect(controls).toHaveLength(2);
    expect(new Set(controls).size).toBe(2);
    for (const id of controls) expect(markup).toContain(`<p id="${id}"`);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
  });

  it("can show only previous attempts after a separately rendered answer and result", () => {
    const markup = renderToStaticMarkup(<AttemptHistory attempts={[attempt, { ...attempt, id: "second", number: 2, text: "Текущий ответ", status: "submitted" }]} hideCurrentAnswer />);
    expect(markup).toContain("Предыдущие попытки");
    expect(markup).toContain("Первый ответ");
    expect(markup).not.toContain("Текущий ответ");
    expect(markup).not.toContain("<details open");
    expect(renderToStaticMarkup(<AttemptHistory attempts={[attempt]} hideCurrentAnswer />)).toBe("");
  });
});
