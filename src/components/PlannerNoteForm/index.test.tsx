import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import PlannerNoteForm from ".";

vi.mock("../Modal", () => ({ default: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }));
vi.mock("../DateTimePicker", () => ({ default: ({ ariaLabel }: { ariaLabel: string }) => <button type="button" aria-label={ariaLabel}>{ariaLabel}</button> }));
vi.mock("../Dropdown", () => ({ default: ({ label }: { label: string }) => <button type="button">{label}</button> }));
vi.mock("../../hooks/useUnsavedChangesWarning", () => ({ default: () => {} }));
const note: PlannerNote = { id: "", title: "", text: "", createdAt: new Date(2026, 10, 2), completed: false, priority: "medium", category: "study" };
const render = (value: PlannerNote) => renderToStaticMarkup(<PlannerNoteForm note={value} onSave={() => {}} onClose={() => {}} />);

describe("planner note form", () => {
  it("shows title and day first and folds optional fields behind a discoverable summary", () => {
    const html = render(note);
    expect(html.indexOf("Название")).toBeLessThan(html.indexOf("День задачи"));
    expect(html).toContain("Дополнительные параметры");
    expect(html).toMatch(/<details[^>]*><summary>/);
    expect(html).toContain("окончание без начала — крайний срок");
    expect(html).toContain("Ctrl / ⌘ + Enter");
  });
  it("opens existing details and summarizes configured values", () => {
    const html = render({ ...note, id: "task", title: "Подготовка", text: "Черновик", priority: "high", category: "personal", endAt: new Date(2026, 10, 4, 12) });
    expect(html).toMatch(/<details[^>]*open=""/);
    expect(html).toContain("есть описание"); expect(html).toContain("Личная"); expect(html).toContain("Приоритет: высокий");
    expect(html).toContain("4 нояб.");
  });
});
