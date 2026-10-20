import { describe, expect, it } from "vitest";
import { filterSchedule, getScheduleDayRows, getScheduleRange, getScheduleSuggestions, getWeekDays, layoutScheduleDay } from "./scheduleLayout";
import { getDemoWeekSchedule } from "../data/schedule";
import { DEMO_SCHEDULE_SLOTS } from "../data/scheduleSlots";
import type { ScheduleItem } from "../types/sched";

const schedule = getDemoWeekSchedule(new Date(2026, 9, 5));
const item = (id: number, startTime: string, endTime: string): ScheduleItem => ({ ...schedule[0], id, startTime, endTime });
describe("schedule layout and search", () => {
  it("creates all seven local dates across a month boundary", () => {
    expect(getWeekDays(new Date(2026, 10, 1)).map((day) => day.key)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
  it("derives suggestions and counts from actual lessons", () => {
    expect(getScheduleSuggestions(schedule, "group")).toEqual([{ title: "112-МКо", count: 15 }, { title: "113-МКо", count: 5 }]);
    expect(getScheduleSuggestions(schedule, "teacher", "волкова")).toEqual([{ title: "Волкова Е.В.", count: 15 }]);
    expect(getScheduleSuggestions(schedule, "auditory", "202")).toEqual([{ title: "Ауд. 202", count: 5 }]);
  });
  it("filters rooms and groups and combines query words in any order", () => {
    expect(filterSchedule(schedule, "group", "мко 112")).toHaveLength(15);
    expect(filterSchedule(schedule, "auditory", "303")).toHaveLength(5);
    expect(filterSchedule(schedule, "teacher", "Е.В. ВОЛКОВА")).toHaveLength(15);
    expect(filterSchedule(schedule, "teacher", "неизвестный")).toEqual([]);
  });
  it("keeps a useful time range while including early and late lessons", () => {
    expect(getScheduleRange(schedule)).toEqual({ start: 480, end: 960 });
    expect(getScheduleRange([item(1, "07:15", "08:00"), item(2, "20:30", "22:15")])).toEqual({ start: 420, end: 1380 });
  });
  it("preserves exact offsets and durations without viewport-dependent sizing", () => {
    const [entry] = layoutScheduleDay([item(1, "08:30", "10:00")], 480, 2);
    expect(entry).toMatchObject({ top: 60, height: 180, lane: 0, lanes: 1 });
  });
  it("separates overlapping lessons, reuses free lanes and leaves later clusters full-width", () => {
    const source = [item(4, "12:00", "13:00"), item(3, "09:00", "10:00"), item(1, "08:00", "10:00"), item(2, "08:00", "09:00")];
    const result = layoutScheduleDay(source, 480, 2);
    expect(result.map(({ item, lane, lanes }) => [item.id, lane, lanes])).toEqual([[1, 0, 2], [2, 1, 2], [3, 1, 2], [4, 0, 1]]);
    expect(source.map((lesson) => lesson.id)).toEqual([4, 3, 1, 2]);
  });
  it("does not treat adjacent lessons as overlapping", () => {
    expect(layoutScheduleDay([item(1, "08:00", "09:00"), item(2, "09:00", "10:00")], 480, 2).every((entry) => entry.lanes === 1)).toBe(true);
  });
  it("ignores invalid durations in the grid", () => {
    expect(layoutScheduleDay([item(1, "10:00", "09:00"), item(2, "invalid", "11:00")], 480, 2)).toEqual([]);
  });
  it("keeps all seven numbered periods when a day has no lessons", () => {
    const rows = getScheduleDayRows([], DEMO_SCHEDULE_SLOTS);
    expect(rows.map((row) => row.slot?.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.every((row) => !row.lessons.length && !row.overlapping.length)).toBe(true);
  });
  it("does not renumber later lessons across empty periods", () => {
    const early = item(1, "10:10", "11:40");
    const late = item(2, "19:20", "20:50");
    const rows = getScheduleDayRows([late, early], DEMO_SCHEDULE_SLOTS);
    expect(rows).toHaveLength(7);
    expect(rows[0].lessons).toEqual([]);
    expect(rows[1].lessons).toEqual([early]);
    expect(rows[6].lessons).toEqual([late]);
  });
  it("keeps changed times in their own chronological row without pretending the intersected slot is free", () => {
    const changed = item(1, "09:00", "10:30");
    const rows = getScheduleDayRows([changed], DEMO_SCHEDULE_SLOTS);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ slot: { number: 1 }, lessons: [], overlapping: [changed] });
    expect(rows[1]).toMatchObject({ slot: null, lessons: [changed] });
    expect(rows[2]).toMatchObject({ slot: { number: 2 }, overlapping: [changed] });
    expect(rows.flatMap((row) => row.lessons)).toEqual([changed]);
  });
  it("marks slots crossed by a long lesson but not slots starting exactly when it ends", () => {
    const long = item(1, "08:30", "12:10");
    const rows = getScheduleDayRows([long], DEMO_SCHEDULE_SLOTS);
    expect(rows[0].lessons).toEqual([long]);
    expect(rows[1].overlapping).toEqual([long]);
    expect(rows[2].overlapping).toEqual([]);
  });
  it("keeps simultaneous lessons in one numbered period without dropping any", () => {
    const sameTime = [item(1, "08:30", "10:00"), item(2, "08:30", "10:00")];
    expect(getScheduleDayRows(sameTime, DEMO_SCHEDULE_SLOTS)[0].lessons).toEqual(sameTime);
  });
});
