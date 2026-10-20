import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { toLocalDateKey } from "./schedule";

export const parseCalendarDate = (value: string | null): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return toLocalDateKey(date) === value ? date : undefined;
};

export const getCalendarMonthDays = (month: Date): Date[] => {
  const firstDay = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const lastDay = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(firstDay, index));
  return days.filter((day) => day <= lastDay);
};

export const getDayInMonth = (day: Date, month: Date): Date => new Date(
  month.getFullYear(),
  month.getMonth(),
  Math.min(day.getDate(), endOfMonth(month).getDate()),
);
