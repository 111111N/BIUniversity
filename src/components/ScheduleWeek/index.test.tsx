import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RoleProvider } from "../RoleContext";
import { getDemoWeekSchedule } from "../../data/schedule";
import WeeklySchedule from ".";

const week = new Date(2026, 9, 5);
const render = (schedule = getDemoWeekSchedule(week)) => renderToStaticMarkup(<MemoryRouter><RoleProvider><WeeklySchedule schedule={schedule} selectedWeek={week} /></RoleProvider></MemoryRouter>);
describe("weekly schedule", () => {
  it("provides dated headers, both views and explicit keyboard scroll controls", () => {
    const html = render();
    expect(html).toContain('dateTime="2026-10-05"');
    expect(html).toContain("5 окт");
    expect(html).toContain("Сетка");
    expect(html).toContain("Список");
    expect(html).toContain('aria-label="Следующие дни"');
    expect(html).toContain("Печать / PDF");
  });
  it("explains an empty week without a blank time grid", () => {
    const html = render([]);
    expect(html).toContain("На этой неделе занятий нет");
    expect(html).not.toContain("Недельное расписание. Стрелки");
  });
  it("does not render lessons from outside the selected week", () => {
    const html = render(getDemoWeekSchedule(new Date(2026, 9, 12)));
    expect(html).toContain("На этой неделе занятий нет");
    expect(html).not.toContain("Волкова Е.В.");
  });
});
