import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RoleProvider } from "../RoleContext";
import { getDemoWeekSchedule } from "../../data/schedule";
import WeeklySchedule from ".";
import { readAssignmentListState } from "../../data/assignmentData";

const preference = vi.hoisted(() => ({ view: "grid" as "grid" | "list" }));
vi.mock("../../hooks/useViewPreference", () => ({ default: () => [preference.view, vi.fn()] }));
vi.mock("../../data/assignmentData", () => ({ readAssignmentListState: vi.fn(() => ({ assignments: [], error: "" })) }));

const week = new Date(2026, 9, 5);
const render = (schedule = getDemoWeekSchedule(week), state: Pick<ComponentProps<typeof WeeklySchedule>, "readError" | "filtered"> = {}, view: "grid" | "list" = "grid") => {
  preference.view = view;
  return renderToStaticMarkup(<MemoryRouter><RoleProvider><WeeklySchedule schedule={schedule} selectedWeek={week} onRetry={() => {}} {...state} /></RoleProvider></MemoryRouter>);
};
describe("weekly schedule", () => {
  it("provides dated headers, both views and explicit keyboard scroll controls", () => {
    const html = render();
    expect(html).toContain('dateTime="2026-10-05"');
    expect(html).toContain("5 окт");
    expect(html).toContain("Сетка");
    expect(html).toContain("Список");
    expect(html).toContain('aria-label="Следующие дни"');
    expect(html).toMatch(/<button[^>]*aria-label="Печать \/ PDF"[^>]*><svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<button[^>]*hidden=""[^>]*aria-label="Печать \/ PDF"/);
  });
  it("explains an empty week without a blank time grid", () => {
    const html = render([]);
    expect(html).toContain("На этой неделе занятий нет");
    expect(html).toContain("Выберите другую неделю.");
    expect(html).not.toContain("измените поиск");
    expect(html).not.toContain("Недельное расписание. Стрелки");
  });
  it("does not render lessons from outside the selected week", () => {
    const html = render(getDemoWeekSchedule(new Date(2026, 9, 12)));
    expect(html).toContain("На этой неделе занятий нет");
    expect(html).not.toContain("Волкова Е.В.");
  });
  it.each(["grid", "list"] as const)("keeps foreign short lessons keyboard accessible in %s without offering journal access", (view) => {
    const lesson = { ...getDemoWeekSchedule(week)[0], teacherId: "another-teacher", teacher: "Другой П.П.", endTime: "08:45" };
    const html = render([lesson], {}, view);
    expect((html.match(/data-schedule-lesson=/g) ?? []).length).toBe(1);
    expect((html.match(/<button[^>]+data-schedule-lesson=/g) ?? []).length).toBe(1);
    expect(html).toContain("Открыть сведения о паре. Только просмотр расписания");
    expect(html).not.toContain("Нажмите на пару, чтобы открыть сведения");
    expect(html).not.toContain("Открыть журнал");
  });
  it("links all six day controls to labelled programmatic focus targets without adding tab stops", () => {
    const html = render(undefined, {}, "list");
    const dayNavigation = html.match(/<nav[^>]*aria-label="Перейти к дню недели"[^>]*>(.*?)<\/nav>/)?.[1];
    expect(dayNavigation).toBeTruthy();
    const controls = [...(dayNavigation ?? "").matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
    expect(controls).toHaveLength(6);
    for (const id of controls) {
      expect(html).toContain(`id="${id}" data-schedule-day=`);
    }
    expect(dayNavigation).not.toContain("aria-pressed");
    expect(html.indexOf("Показать все пары")).toBeGreaterThan(html.indexOf('aria-label="Перейти к дню недели"'));
    expect((html.match(/data-schedule-day="[^"]+" tabindex="-1"/g) ?? []).length).toBe(6);
    expect(html).not.toContain('data-schedule-day="2026-10-11"');
  });
  it("links both edge arrows to the scroll region while preserving day jumps separately", () => {
    const html = render();
    const arrows = [...html.matchAll(/<button[^>]*aria-label="(?:Предыдущие|Следующие) дни"[^>]*>/g)].map((match) => match[0]);
    expect(arrows).toHaveLength(2);
    for (const arrow of arrows) {
      const target = arrow.match(/aria-controls="([^"]+)"/)?.[1];
      expect(target).toBeTruthy();
      expect(html).toMatch(new RegExp(`<div id="${target}"[^>]*role="region"`));
    }
  });
  it.each([false, true])("does not turn unavailable schedule data into empty counts, lessons or a printable empty week (stale data: %s)", (stale) => {
    const schedule = stale ? [{ ...getDemoWeekSchedule(week)[0], subject: "PRIVATE STALE LESSON" }] : [];
    const html = render(schedule, { readError: "Storage unavailable" });
    expect(html).toContain('role="alert"'); expect(html).toContain("Не удалось загрузить расписание.");
    expect(html).toContain("Повторить загрузку"); expect(html).not.toContain("На этой неделе занятий нет");
    expect(html).not.toContain("0 занятий"); expect(html).not.toContain("0 учебных дней");
    expect(html).not.toContain("data-schedule-lesson"); expect(html).not.toContain("PRIVATE");
    expect(html).not.toContain("Storage unavailable");
    expect(html).toMatch(/<button[^>]*aria-label="Печать \/ PDF"[^>]*disabled=""/);
    expect(html).toMatch(/<section[^>]*tabindex="-1"[^>]*aria-label="Расписание выбранной недели"/);
  });
  it("starts the week list with lesson rows and a compact summary of free days", () => {
    const html = render([getDemoWeekSchedule(week)[0]], {}, "list");
    expect(html).toContain("Показать все пары");
    expect(html).toContain("Свободный день — занятий нет");
    expect(html).not.toContain("Нет занятий</span>");
  });
  it("renders only the selected view and keeps the evening scale even for a single morning lesson", () => {
    const lesson = { ...getDemoWeekSchedule(week)[0], endTime: "10:00" };
    const grid = render([lesson]);
    expect(grid).toContain("21:00");
    expect(grid).not.toContain('aria-label="Расписание всей недели списком"');
    expect(grid.match(/data-schedule-lesson=/g)).toHaveLength(1);
    const list = render([lesson], {}, "list");
    expect(list).toContain('aria-label="Расписание всей недели списком"');
    expect(list).not.toContain('aria-label="Недельное расписание. Стрелки');
    expect(list.match(/data-schedule-lesson=/g)).toHaveLength(1);
    expect(readAssignmentListState).not.toHaveBeenCalled();
  });
  it("distinguishes a readable empty search from a week without personal lessons", () => {
    const filtered = render([], { filtered: true });
    expect(filtered).toContain("По этому запросу занятий нет"); expect(filtered).not.toContain("На этой неделе занятий нет");
    expect(filtered).toContain("Выберите другую неделю или измените поиск.");
    expect(filtered).not.toContain("Повторить загрузку"); expect(filtered).not.toMatch(/<button[^>]*aria-label="Печать \/ PDF"[^>]*disabled=""/);
    expect(render([])).toContain("На этой неделе занятий нет");
  });
});
