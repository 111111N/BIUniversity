import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChartDataList from ".";

describe("chart data keyboard access", () => {
  const points = [{ index: 0, label: "Сентябрь", value: 75 }, { index: 1, label: "Октябрь", value: null }];
  it("keeps the list semantics inside a named focusable scroll region", () => {
    const html = renderToStaticMarkup(<ChartDataList points={points} label="Посещаемость по месяцам" />);
    expect(html).toMatch(/<div[^>]*role="region" aria-label="Посещаемость по месяцам" tabindex="0"><ul/);
    expect(html).not.toMatch(/<ul[^>]*tabindex/); expect(html).toContain("Сентябрь"); expect(html).toContain("Нет отметок");
  });
  it("retains native buttons for selectable periods and does not make missing data actionable", () => {
    const html = renderToStaticMarkup(<ChartDataList points={points} label="Посещаемость" selectedIndex={0} onSelect={() => undefined} />);
    expect((html.match(/<button/g) ?? []).length).toBe(1); expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Снять фильтр периода"); expect(html).toContain("Нет отметок");
  });
});
