import { format } from "date-fns";
import { parseCalendarDate } from "../../domain/calendar";

export const parsePickerDateText = (text: string): Date | undefined => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim()) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(text.trim());
  return match ? parseCalendarDate(`${match[3]}-${match[2]}-${match[1]}`) : undefined;
};

export const parsePickerTimeText = (text: string): { hours: number; minutes: number } | undefined => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim()) ?? /^(\d{2})(\d{2})$/.exec(text.trim());
  if (!match) return;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : undefined;
};

export const formatPickerDateText = (value?: Date) => value ? format(value, "dd.MM.yyyy") : "";
export const formatPickerTimeText = (hours: number, minutes: number) => `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
