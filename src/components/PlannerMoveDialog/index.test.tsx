import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import PlannerMoveDialog from ".";

vi.mock("../Modal", () => ({ default: ({ children, labelledBy }: { children: ReactNode; labelledBy: string }) => <div role="dialog" aria-labelledby={labelledBy}>{children}</div> }));
const note: PlannerNote = { id: "task", title: "Подготовка", text: "Описание", createdAt: new Date(2026, 10, 2), startAt: new Date(2026, 10, 2, 9), endAt: new Date(2026, 10, 3, 11), completed: false, priority: "medium", category: "study" };
const noop = () => {};
const render = (props: Partial<ComponentProps<typeof PlannerMoveDialog>> = {}) => renderToStaticMarkup(<PlannerMoveDialog note={note} onMove={noop} onRetry={noop} onClose={noop} {...props} />);
describe("planner move preview availability", () => {
  it("shows both dates without pretending a same-day choice is a change", () => {
    const html = render();
    expect(html).toContain("Подготовка"); expect(html).toContain("Было"); expect(html).toContain("Будет");
    expect(html).toContain("Начало и окончание сдвигаются вместе");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain('aria-label="Новый день задачи:');
    expect(html).not.toContain('aria-label="Очистить дату"');
  });
  it("allows closing and rereading after a storage error without claiming deletion", () => {
    const html = render({ error: "Не удалось прочитать задачи." });
    expect(html).toContain("Не удалось прочитать задачи."); expect(html).toContain("Повторить чтение");
    expect(html).not.toContain("Задача удалена");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Отмена/);
  });
  it("shows actual deletion and independent external changes distinctly", () => {
    expect(render({ currentNote: null })).toContain("Перенос не восстановит её");
    const html = render({ currentNote: { ...note, title: "Другая правка" } });
    expect(html).toContain("Задача изменилась в другом месте");
    expect(html).not.toContain("Задача удалена");
  });
  it("blocks an invalid saved interval and asks to correct the task first", () => {
    const html = render({ note: { ...note, endAt: new Date(2026, 10, 1) } });
    expect(html).toContain("Сначала исправьте время в задаче");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Изменения сохранены");
  });
});
