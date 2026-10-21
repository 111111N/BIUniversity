import type { ScheduleItem, ScheduleSlot } from "../types/sched";
import { getWeekStart, toLocalDateKey } from "./schedule";
import { matchesSearchText } from "./search";

export type ScheduleSearchType = "group" | "auditory" | "teacher";
export const scheduleLessonTypeLabels: Record<ScheduleItem["type"], string> = { "Лек.": "Лекция", "Пр.": "Практика", "Лаб.": "Лабораторная", "Зач.": "Зачёт", "Экз.": "Экзамен" };
export const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
export const getWeekDays = (week: Date) => Array.from({ length: 6 }, (_, index) => {
  const date = getWeekStart(week);
  date.setDate(date.getDate() + index);
  return { date, key: toLocalDateKey(date) };
});
export const filterSchedule = (schedule: ScheduleItem[], type: ScheduleSearchType, query: string) => schedule.filter((lesson) => matchesSearchText(type === "group" ? lesson.group ?? "" : type === "auditory" ? lesson.location : lesson.teacher ?? "", query));
export const getScheduleSuggestions = (schedule: ScheduleItem[], type: ScheduleSearchType, query = "") => {
  const values = new Map<string, number>();
  for (const lesson of schedule) {
    const value = type === "group" ? lesson.group : type === "auditory" ? lesson.location : lesson.teacher;
    if (value && matchesSearchText(value, query)) values.set(value, (values.get(value) ?? 0) + 1);
  }
  return [...values].map(([title, count]) => ({ title, count })).sort((a, b) => a.title.localeCompare(b.title, "ru-RU", { numeric: true }));
};
export const getScheduleRange = (schedule: ScheduleItem[]) => ({
  start: schedule.length ? Math.min(8 * 60, ...schedule.map((lesson) => Math.floor(timeToMinutes(lesson.startTime) / 60) * 60)) : 8 * 60,
  end: schedule.length ? Math.max(16 * 60, ...schedule.map((lesson) => Math.ceil(timeToMinutes(lesson.endTime) / 60) * 60)) : 16 * 60,
});

export interface ScheduleListRow {
  key: string;
  slot: ScheduleSlot | null;
  lessons: ScheduleItem[];
  overlapping: ScheduleItem[];
}

/** Пустые слоты не сдвигают номера пар; нестандартное время остаётся отдельной строкой. */
export const getScheduleDayRows = (lessons: ScheduleItem[], slots: ScheduleSlot[]): ScheduleListRow[] => {
  const rows: ScheduleListRow[] = slots.map((slot) => ({
    key: `slot-${slot.number}`,
    slot,
    lessons: lessons.filter((item) => item.startTime === slot.startTime),
    overlapping: lessons.filter((item) => item.startTime !== slot.startTime && timeToMinutes(item.startTime) < timeToMinutes(slot.endTime) && timeToMinutes(item.endTime) > timeToMinutes(slot.startTime)),
  }));
  const starts = new Set(slots.map((slot) => slot.startTime));
  const extraStarts = new Set(lessons.filter((item) => !starts.has(item.startTime)).map((item) => item.startTime));
  for (const start of extraStarts) rows.push({ key: `extra-${start}`, slot: null, lessons: lessons.filter((item) => item.startTime === start), overlapping: [] });
  return rows.sort((a, b) => timeToMinutes(a.slot?.startTime ?? a.lessons[0].startTime) - timeToMinutes(b.slot?.startTime ?? b.lessons[0].startTime));
};

/** Overlapping lessons occupy separate lanes within the same time range. */
export const layoutScheduleDay = (lessons: ScheduleItem[], start: number, pixelsPerMinute: number) => {
  const sorted = [...lessons].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || a.id - b.id);
  const result: { item: ScheduleItem; top: number; height: number; lane: number; lanes: number }[] = [];
  let cluster: typeof result = [];
  let ends: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => { result.push(...cluster.map((entry) => ({ ...entry, lanes: ends.length }))); cluster = []; ends = []; };
  for (const item of sorted) {
    const from = timeToMinutes(item.startTime);
    const to = timeToMinutes(item.endTime);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
    if (from >= clusterEnd) flush();
    let lane = ends.findIndex((end) => end <= from);
    if (lane < 0) lane = ends.length;
    ends[lane] = to;
    clusterEnd = Math.max(clusterEnd, to);
    cluster.push({ item, top: (from - start) * pixelsPerMinute, height: (to - from) * pixelsPerMinute, lane, lanes: 1 });
  }
  flush();
  return result;
};
