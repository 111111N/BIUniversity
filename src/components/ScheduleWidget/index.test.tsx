import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ScheduleItem } from "../../types/sched";
import Schedule from ".";

const lesson: ScheduleItem = { id: 1, subject: "Теория вероятностей", date: "2026-10-29", type: "Пр.", startTime: "09:00", endTime: "10:30", dayOfWeek: 4, group: "112-МКо", location: "Ауд. 424/1", teacher: "Волкова Е.В." };
const render = (lessons: ScheduleItem[]) => renderToStaticMarkup(<MemoryRouter><Schedule schedule={lessons} currentTime={new Date(2026, 9, 29, 12)} fill /></MemoryRouter>);

describe("home schedule accessibility", () => {
  it("provides keyboard access to the scroll region and distinguishes repeated lessons in link names", () => {
    const markup = render([lesson, { ...lesson, id: 2, startTime: "13:00", endTime: "14:30", location: "Ауд. 311/2" }]);
    expect(markup).toMatch(/role="region"[^>]*aria-label="Занятия на выбранный день"[^>]*tabindex="0"/);
    expect(markup).toContain('aria-label="Открыть расписание: Теория вероятностей, 09:00–10:30, 112-МКо, Ауд. 424/1"');
    expect(markup).toContain('aria-label="Открыть расписание: Теория вероятностей, 13:00–14:30, 112-МКо, Ауд. 311/2"');
    expect(markup).toContain("Завершено");
    expect(markup).toContain("Волкова Е.В.");
    expect(markup.match(/href="\/schedule\?date=2026-10-29"/g)).toHaveLength(2);
  });

  it("does not read an absent group as undefined or create an empty keyboard scroll stop", () => {
    const markup = render([{ ...lesson, group: undefined }]);
    expect(markup).toContain('aria-label="Открыть расписание: Теория вероятностей, 09:00–10:30, Ауд. 424/1"');
    expect(markup).not.toContain("undefined");
    expect(render([])).not.toContain('role="region"');
  });
});
