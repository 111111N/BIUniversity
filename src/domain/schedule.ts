export interface TimeSlot {
  start: number;
  end: number;
}

export const hasTimeOverlap = (start: number, end: number, slots: TimeSlot[]) =>
  slots.some((slot) => Math.max(slot.start, start) < Math.min(slot.end, end));

export const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;


export const getWeekStart = (date: Date) => {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return monday;
};

export const getLessonStatus = (lesson: { date: string; startTime: string; endTime: string }, now: Date) => {
  const start = new Date(`${lesson.date}T${lesson.startTime}:00`).getTime();
  const end = new Date(`${lesson.date}T${lesson.endTime}:00`).getTime();
  if (now.getTime() >= end) return { state: "past", label: "Завершено" };
  if (now.getTime() >= start) return { state: "now", label: "Сейчас" };
  const minutes = Math.ceil((start - now.getTime()) / 60000);
  if (minutes <= 10) return { state: "soon", label: "Скоро" };
  const hours = Math.floor(minutes / 60);
  return { state: "next", label: hours ? `Через ${hours} ч ${minutes % 60} мин` : `Через ${minutes} мин` };
};
