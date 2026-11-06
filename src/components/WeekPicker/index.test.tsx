import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WeekPicker from ".";

const render = (date: Date) => renderToStaticMarkup(<WeekPicker value={date} onWeekChange={() => {}} />);

describe("week picker boundaries", () => {
  it.each([new Date(2026, 6, 27), new Date(2026, 7, 3), new Date(2026, 7, 31), new Date(2026, 8, 7)])("keeps both navigation arrows enabled around the academic-year boundaries (%s)", (date) => {
    const html = render(date);
    expect(html).toMatch(/<button[^>]*aria-label="Предыдущая неделя"/);
    expect(html).toMatch(/<button[^>]*aria-label="Следующая неделя"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="(Предыдущая|Следующая) неделя"/);
  });
  it("keeps a directly linked August week selectable and displays its range", () => {
    const html = render(new Date(2026, 7, 10));
    expect(html).toContain("10 - 16 августа 2026 г.");
    expect(html).toContain("value=");
  });
  it("shows both years for a cross-year week", () => {
    const html = render(new Date(2026, 11, 28));
    expect(html).toContain("2026 г. - 3 января 2027 г.");
  });
});
