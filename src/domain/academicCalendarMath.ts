import { isAcademicCalendarDate } from "./academicPeriods";

const DAY = 86_400_000;
export interface AcademicDateRange { startsOn: string; endsOn: string }
export interface AcademicCalendarWeek extends AcademicDateRange { weekStart: string }

export const academicDayNumber = (date: string): number => {
  if (!isAcademicCalendarDate(date)) throw new Error("Укажите существующую календарную дату в формате ГГГГ-ММ-ДД.");
  return Date.parse(`${date}T00:00:00.000Z`) / DAY;
};
export const academicDayKey = (day: number): string => {
  if (!Number.isSafeInteger(day)) throw new Error("Некорректный календарный день.");
  const date = new Date(day * DAY);
  if (!Number.isFinite(date.getTime())) throw new Error("Календарная дата вне поддерживаемого диапазона.");
  const key = date.toISOString().slice(0, 10);
  if (!isAcademicCalendarDate(key)) throw new Error("Календарная дата вне поддерживаемого диапазона.");
  return key;
};
export const academicRangeDays = (range: AcademicDateRange): number => {
  const start = academicDayNumber(range.startsOn), end = academicDayNumber(range.endsOn);
  if (end < start) throw new Error("Окончание периода должно быть не раньше начала.");
  return end - start + 1;
};
export const academicRangesOverlap = (left: AcademicDateRange, right: AcademicDateRange): boolean =>
  left.startsOn <= right.endsOn && left.endsOn >= right.startsOn;

/** Split calendar dates in UTC: local daylight-saving changes must not shift a teaching day. */
export const academicCalendarWeeks = (range: AcademicDateRange): AcademicCalendarWeek[] => {
  if (academicRangeDays(range) > 3660) throw new Error("Для показа недель выберите период не длиннее десяти лет.");
  const start = academicDayNumber(range.startsOn), end = academicDayNumber(range.endsOn);
  const monday = start - ((new Date(start * DAY).getUTCDay() + 6) % 7);
  const result: AcademicCalendarWeek[] = [];
  for (let first = monday; first <= end; first += 7) result.push({
    weekStart: academicDayKey(first), startsOn: academicDayKey(Math.max(first, start)), endsOn: academicDayKey(Math.min(first + 6, end)),
  });
  return result;
};
export const formatAcademicDay = (date: string): string => {
  academicDayNumber(date);
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
};
