import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SubmissionAttempt } from "../../../data/assignmentStore";
import SubmissionResult from ".";

const attempt: SubmissionAttempt = { id: "first", number: 1, text: "Ответ", status: "revision", teacherComment: "Уточните вывод.", sentAt: "2026-10-20T12:00", updatedAt: "2026-10-20T13:00", reviewedAt: "2026-10-20T13:00", submittedLate: false };

describe("submission result context", () => {
  it("still describes the current revision as requiring a new answer", () => {
    const markup = renderToStaticMarkup(<SubmissionResult attempt={attempt} />);
    expect(markup).toContain("Нужна доработка");
    expect(markup).toContain("Ожидается новая попытка студента");
    expect(markup).not.toContain("Результат предыдущей попытки");
  });

  it("keeps an earlier revision as history without asking for another resubmission", () => {
    const markup = renderToStaticMarkup(<SubmissionResult attempt={attempt} historical />);
    expect(markup).toContain("Возвращено на доработку");
    expect(markup).toContain("Результат предыдущей попытки");
    expect(markup).toContain(attempt.teacherComment);
    expect(markup).toContain(`dateTime="${attempt.reviewedAt}"`);
    expect(markup).not.toContain("Нужна доработка");
    expect(markup).not.toContain("Ожидается новая попытка");
  });

  it.each([false, true])("preserves the grade and comment for a reviewed attempt (historical: %s)", (historical) => {
    const markup = renderToStaticMarkup(<SubmissionResult attempt={{ ...attempt, status: "graded", grade: "4" }} historical={historical} />);
    expect(markup).toContain('aria-label="Оценка 4"');
    expect(markup).toContain("Работа проверена");
    expect(markup).toContain(attempt.teacherComment);
    expect(markup).toContain(historical ? "Результат предыдущей попытки" : "Результат доступен студенту");
    expect(markup).not.toContain(historical ? "Результат доступен студенту" : "Результат предыдущей попытки");
  });
});
