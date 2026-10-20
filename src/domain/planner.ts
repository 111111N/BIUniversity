import type { PlannerNote } from "../data/plannerStore";
import { toLocalDateKey } from "./schedule";

export const getPlannerNoteDate = (note: PlannerNote) => note.startAt ?? note.createdAt;
export const formatPlannerTime = (note: PlannerNote) => {
  const time = (date: Date) => date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const dateTime = (date: Date) => `${date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${time(date)}`;
  if (!note.startAt) return note.endAt ? `До ${dateTime(note.endAt)}` : "Без времени";
  if (!note.endAt) return time(note.startAt);
  return `${time(note.startAt)} — ${toLocalDateKey(note.startAt) === toLocalDateKey(note.endAt) ? time(note.endAt) : dateTime(note.endAt)}`;
};
export const createPlannerNote = (date: Date): PlannerNote => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return { id: "", title: "", text: "", createdAt: day, completed: false, priority: "medium", category: "study" };
};
export const getPlannerHref = (date: Date, noteId?: string) => {
  const params = new URLSearchParams({ date: toLocalDateKey(date) });
  if (noteId) params.set("task", noteId);
  return `/planner?${params}`;
};
export const getPlannerDayNotes = (notes: PlannerNote[], date: Date) => notes
  .filter((note) => toLocalDateKey(getPlannerNoteDate(note)) === toLocalDateKey(date))
  .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0));

export const getNextPlannerNotes = (notes: PlannerNote[], date: Date) => notes
  .filter((note) => !note.completed && toLocalDateKey(getPlannerNoteDate(note)) >= toLocalDateKey(date))
  .sort((a, b) => getPlannerNoteDate(a).getTime() - getPlannerNoteDate(b).getTime());
