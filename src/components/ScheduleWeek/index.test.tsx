import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { RoleProvider } from "../RoleContext";
import { getDemoWeekSchedule } from "../../data/schedule";
import WeeklySchedule from ".";

const week = new Date(2026, 9, 5);
const render = (schedule = getDemoWeekSchedule(week), state: Pick<ComponentProps<typeof WeeklySchedule>, "readError" | "filtered"> = {}) => renderToStaticMarkup(<MemoryRouter><RoleProvider><WeeklySchedule schedule={schedule} selectedWeek={week} onRetry={() => {}} {...state} /></RoleProvider></MemoryRouter>);
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
  it("keeps foreign short lessons keyboard accessible in both views without offering journal access", () => {
    const lesson = { ...getDemoWeekSchedule(week)[0], teacherId: "another-teacher", teacher: "Другой П.П.", endTime: "08:45" };
    const html = render([lesson]);
    expect((html.match(/data-schedule-lesson=/g) ?? []).length).toBe(2);
    expect((html.match(/<button[^>]+data-schedule-lesson=/g) ?? []).length).toBe(2);
    expect(html).toContain("Открыть сведения о паре. Только просмотр расписания");
    expect(html).toContain("Нажмите на пару, чтобы открыть сведения");
    expect(html).not.toContain("Открыть журнал");
  });
  it("links all six day controls to labelled programmatic focus targets without adding tab stops", () => {
    const html = render();
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(controls).toHaveLength(6);
    for (const id of controls) {
      expect(html).toContain(`id="${id}" data-schedule-day=`);
    }
    expect((html.match(/data-schedule-day="[^"]+" tabindex="-1"/g) ?? []).length).toBe(6);
    expect(html).not.toContain('data-schedule-day="2026-10-11"');
  });
  it.each([false, true])("does not turn unavailable schedule data into empty counts, lessons or a printable empty week (stale data: %s)", (stale) => {
    const schedule = stale ? [{ ...getDemoWeekSchedule(week)[0], subject: "PRIVATE STALE LESSON" }] : [];
    const html = render(schedule, { readError: "Storage unavailable" });
    expect(html).toContain('role="alert"'); expect(html).toContain("Не удалось загрузить расписание.");
    expect(html).toContain("Повторить загрузку"); expect(html).not.toContain("На этой неделе занятий нет");
    expect(html).not.toContain("0 занятий"); expect(html).not.toContain("0 учебных дней");
    expect(html).not.toContain("data-schedule-lesson"); expect(html).not.toContain("PRIVATE");
    expect(html).not.toContain("Storage unavailable");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Печать \/ PDF/);
    expect(html).toMatch(/<section[^>]*tabindex="-1"[^>]*aria-label="Расписание выбранной недели"/);
  });
  it("distinguishes a readable empty search from a week without personal lessons", () => {
    const filtered = render([], { filtered: true });
    expect(filtered).toContain("По этому запросу занятий нет"); expect(filtered).not.toContain("На этой неделе занятий нет");
    expect(filtered).not.toContain("Повторить загрузку"); expect(filtered).not.toMatch(/<button[^>]*disabled=""[^>]*>Печать \/ PDF/);
    expect(render([])).toContain("На этой неделе занятий нет");
  });
});
