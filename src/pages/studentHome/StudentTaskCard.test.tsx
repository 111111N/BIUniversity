import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Assignment } from "../../data/assignmentStore";
import { getStudentDashboardTasks } from "../../domain/dashboardAssignments";
import StudentTaskCard from "./StudentTaskCard";

describe("student home assignment card", () => {
  const now = new Date("2026-10-29T12:00:00");
  const assignment: Assignment = {
    id: "task-1", subjectId: "data-analysis", groupId: "112-mko", subject: "Анализ данных", group: "112-МКо",
    title: "Работа", description: "Описание", lessonDate: "2026-10-28T09:00", lessonType: "Практика",
    deadline: "2027-01-05T18:45", status: "published", allowLateSubmissions: false,
    createdAt: "2026-10-01T10:00", updatedAt: "2026-10-01T10:00",
  };
  const renderAssignment = (overrides: Partial<Assignment> = {}) => {
    const [task] = getStudentDashboardTasks([ { ...assignment, ...overrides } ], [], [{ subjectId: "data-analysis", groupIds: ["112-mko"] }], "student-1", now);
    return renderToStaticMarkup(<MemoryRouter><StudentTaskCard task={task} now={now} /></MemoryRouter>);
  };

  it("makes the deadline year and time visible without opening a tooltip", () => {
    const html = renderAssignment();
    const visibleDeadline = html.match(/<time\b[^>]*>(.*?)<\/time>/)?.[1];
    expect(visibleDeadline).toContain("5 января 2027");
    expect(visibleDeadline).toContain("18:45");
    expect(html).toContain("assignment=task-1");
  });

  it("explains that an overdue assignment still accepts an answer", () => {
    const html = renderAssignment({ deadline: "2026-10-28T09:00", allowLateSubmissions: true });
    expect(html).toContain("Можно сдать с опозданием");
    expect(html).toContain("Срок прошёл:");
    expect(html).toContain("Ответить");
  });

  it("does not invite submission when admission is closed", () => {
    const html = renderAssignment({ deadline: "2026-10-28T09:00" });
    expect(html).toContain("Приём завершён");
    expect(html).toContain("Открыть задание");
    expect(html).not.toContain("Можно сдать с опозданием");
    expect(html).not.toContain("Ответить");
  });

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
