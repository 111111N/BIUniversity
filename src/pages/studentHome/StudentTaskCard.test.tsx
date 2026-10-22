import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import StudentTaskCard from "./StudentTaskCard";

describe("student home assignment card", () => {
  it("keeps a saved assignment readable when its deadline is invalid", () => {
    const task = {
      id: "invalid-date", subject: "Анализ данных", subjectId: "data-analysis", title: "Работа",
      deadline: "Invalid Date", deadlineAt: NaN, tag: "Новое" as const, state: "pending" as const,
      completed: false, overdue: false, canSubmit: true,
      href: "/journal/data-analysis/112-mko?tab=assignments&assignment=invalid-date", action: "Ответить",
    };
    const html = renderToStaticMarkup(<MemoryRouter><StudentTaskCard task={task} now={new Date(2026, 9, 22)} /></MemoryRouter>);
    expect(html).toContain("Не указан");
    expect(html).toContain("assignment=invalid-date");
    expect(html).toContain("Ответить");
    expect(html).not.toContain("Invalid Date");
  });
});
