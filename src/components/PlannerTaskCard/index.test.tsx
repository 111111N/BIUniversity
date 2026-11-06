import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import PlannerTaskCard from ".";

vi.mock("../ActionMenu", () => ({ default: () => null }));
const note: PlannerNote = { id: "task", title: "Срочная подготовка", text: "Подробности для просмотра в форме", createdAt: new Date(2026, 10, 2), endAt: new Date(2026, 10, 4, 11), completed: false, priority: "high", category: "study" };
const noop = () => {};
const render = (value: PlannerNote = note, layout: "board" | "list" = "board") => renderToStaticMarkup(<PlannerTaskCard note={value} layout={layout} onEdit={noop} onMove={noop} onDragTask={noop} onDragTaskEnd={noop} onToggle={noop} onDelete={noop} />);

describe("planner task card", () => {
  it("labels urgent tasks and exposes both move and menu actions on touch and keyboard", () => {
    const html = render();
    expect(html).toContain("Высокий"); expect(html).toContain("Перенести</span>");
    expect(html).toContain('aria-label="Перенести задачу: Срочная подготовка"');
    expect(html).toContain('aria-label="Действия с задачей: Срочная подготовка"');
    expect(html).toContain("До 4 нояб.");
    expect(html).toContain("Подробности для просмотра в форме");
  });
  it("keeps action labels and full title in list layout", () => {
    const html = render({ ...note, title: "Длинное название задачи с дополнительными подробностями" }, "list");
    expect(html).toContain("Длинное название задачи с дополнительными подробностями");
    expect(html).toContain("Перенести</span>");
  });
});
