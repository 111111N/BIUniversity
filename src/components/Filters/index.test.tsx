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
  it("preserves the chosen search while data is unavailable without reporting zero matches or showing stale suggestions", () => {
    const lesson = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], group: "PRIVATE STALE GROUP" };
    const html = renderToStaticMarkup(<Filters schedule={[lesson]} unavailable selected={{ type: "group", title: "112-МКо" }} onSearch={() => {}} />);
    expect(html).toContain("Поиск будет доступен после загрузки расписания.");
    expect(html).toContain('value="112-МКо"'); expect(html).toMatch(/<input[^>]*type="search"[^>]*>/);
    expect(html).not.toMatch(/<input[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).not.toContain("Совпадений нет"); expect(html).not.toContain("Быстрый выбор");
    expect(html).not.toContain("Подходящие варианты"); expect(html).not.toContain("PRIVATE");
  });
  it("keeps ordinary empty search usable when schedule data was read successfully", () => {
    const html = renderToStaticMarkup(<Filters schedule={[]} onSearch={() => {}} />);
    expect(html).toContain("Совпадений нет"); expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(html).not.toContain("после загрузки расписания");
  });
});
