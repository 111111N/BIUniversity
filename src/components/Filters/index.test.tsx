import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDemoWeekSchedule } from "../../data/schedule";
import Filters from ".";
describe("schedule search panel", () => {
  it("shows real suggestions, a labelled query and native keyboard-accessible actions", () => {
    const lesson = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
    const html = renderToStaticMarkup(<Filters schedule={[{ ...lesson, group: "112-МКо" }, { ...lesson, id: 2, group: "Тестовая группа" }]} onSearch={() => {}} />);
    expect(html).toContain("112-МКо");
    expect(html).toContain("Тестовая группа");
    expect(html).not.toContain("311-ПМИ");
    expect(html).toContain("Преподаватель");
    expect(html).toContain("<form");
    expect(html).toContain('type="search"');
    expect(html).not.toContain('role="option"');
  });
});
