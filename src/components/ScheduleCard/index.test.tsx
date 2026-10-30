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
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toMatch(/aria-label="[^"]*преподаватель Волкова Е\.В\./);
  });
  it.each([false, true])("allows opening public information for foreign lessons without promising academic access (list: %s)", (list) => {
    const item = getDemoWeekSchedule(new Date(2026, 9, 5))[0];
    const html = renderToStaticMarkup(<ScheduleCard item={item} readOnly list={list} onOpen={() => {}} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(item.subject);
    expect(html).toContain(item.teacher);
    expect(html).toMatch(/aria-label="[^"]*преподаватель Волкова Е\.В\./);
    expect(html).toContain("Только просмотр расписания");
    expect(html).toContain("Открыть сведения о паре");
    expect(html).not.toContain("Задания");
    expect(html).not.toContain("Подробнее");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<a ");
  });
  it("keeps full accessible information for a short overlapping grid card without expanding its time slot", () => {
    const item = { ...getDemoWeekSchedule(new Date(2026, 9, 5))[0], subject: "Очень длинное название дисциплины", endTime: "08:45" };
    const html = renderToStaticMarkup(<ScheduleCard item={item} grid short compact readOnly style={{ height: 16.5, top: 0, width: "calc(50% - 6px)" }} onOpen={() => {}} />);
    expect(html).toMatch(/<button[^>]+aria-label="[^"]*Очень длинное название дисциплины[^"]*08:30–08:45[^"]*Волкова Е\.В\.[^"]*Открыть сведения о паре/);
    expect(html).toContain("height:16.5px"); expect(html).toContain("width:calc(50% - 6px)");
    expect(html).not.toContain("<article"); expect(html).not.toContain("Открыть журнал");
  });
});
