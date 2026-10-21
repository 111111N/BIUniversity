import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDemoWeekSchedule } from "../../data/schedule";
import ScheduleCard from ".";
describe("schedule card", () => {
  it("keeps the full title and group, room, teacher and time in an accessible button", () => {
    const item = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], subject: "Очень длинное название дисциплины, которое нельзя обрезать в данных" };
    const html = renderToStaticMarkup(<ScheduleCard item={item} onOpen={() => {}} />);
    expect(html).toContain(item.subject);
    expect(html).toContain("112-МКо");
    expect(html).toContain("Ауд. 101");
    expect(html).toContain("Волкова Е.В.");
    expect(html).toContain("08:30–10:00");
    expect(html).not.toContain("Задания");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="[^"]*преподаватель Волкова Е\.В\./);
  });
  it.each([false, true])("renders foreign lessons as non-interactive public information (list: %s)", (list) => {
    const item = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
    const html = renderToStaticMarkup(<ScheduleCard item={item} readOnly list={list} onOpen={() => {}} />);
    expect(html).toContain("<article");
    expect(html).toContain(item.subject);
    expect(html).toContain(item.teacher);
    expect(html).toMatch(/aria-label="[^"]*преподаватель Волкова Е\.В\./);
    expect(html).toContain("Только просмотр расписания");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Задания");
    expect(html).not.toContain("Подробнее");
    expect(html).not.toContain("<svg");
  });
});
