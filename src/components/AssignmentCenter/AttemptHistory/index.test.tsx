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
    expect(markup).not.toContain("<details open");
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

  it("can show only previous attempts after a separately rendered answer and result", () => {
    const markup = renderToStaticMarkup(<AttemptHistory attempts={[attempt, { ...attempt, id: "second", number: 2, text: "Текущий ответ", status: "submitted" }]} hideCurrentAnswer />);
    expect(markup).toContain("Предыдущие попытки");
    expect(markup).toContain("Первый ответ");
    expect(markup).not.toContain("Текущий ответ");
    expect(markup).not.toContain("<details open");
    expect(renderToStaticMarkup(<AttemptHistory attempts={[attempt]} hideCurrentAnswer />)).toBe("");
  });
});
