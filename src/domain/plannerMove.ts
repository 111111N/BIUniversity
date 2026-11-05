import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { PlannerNote } from "../data/plannerStore";
import { getPlannerNoteDate } from "./planner";
import { mergePlannerDraft, PlannerDraftConflictError, samePlannerNote } from "./plannerDraft";

export class PlannerMoveError extends Error {}
export interface PlannerMoveSnapshot { before: PlannerNote; after: PlannerNote }
interface PlannerDates { day: Date; startAt?: Date; endAt?: Date }
const valid = (date: Date) => date instanceof Date && Number.isFinite(date.getTime());

export const shiftPlannerDates = (source: PlannerDates, target: Date): PlannerDates => {
  if (!valid(target) || !valid(source.day) || (source.startAt && !valid(source.startAt)) || (source.endAt && !valid(source.endAt))) throw new PlannerMoveError("Не удалось определить день или время задачи. Откройте задачу и проверьте даты.");
  const offset = differenceInCalendarDays(target, source.day);
  return { day: startOfDay(target), startAt: source.startAt ? addDays(source.startAt, offset) : undefined, endAt: source.endAt ? addDays(source.endAt, offset) : undefined };
};

export const movePlannerNoteToDay = (note: PlannerNote, target: Date): PlannerNote => {
  if (!valid(note.createdAt)) throw new PlannerMoveError("Не удалось прочитать день задачи. Перенос отменён.");
  const shifted = shiftPlannerDates({ day: getPlannerNoteDate(note), startAt: note.startAt, endAt: note.endAt }, target);
  if (shifted.startAt && shifted.endAt && shifted.endAt <= shifted.startAt) throw new PlannerMoveError("Окончание задачи должно быть позже начала. Сначала исправьте время в задаче.");
  if (!shifted.startAt && shifted.endAt && shifted.endAt < shifted.day) throw new PlannerMoveError("Окончание не может быть раньше дня задачи. Сначала исправьте даты в задаче.");
  if (!differenceInCalendarDays(target, getPlannerNoteDate(note))) return note;
  // Untimed legacy tasks keep their planned day in createdAt, as in the existing form.
  return { ...note, createdAt: note.startAt ? note.createdAt : shifted.day, startAt: shifted.startAt, endAt: shifted.endAt };
};

const findCurrent = (notes: readonly PlannerNote[], id: string) => {
  const matching = notes.filter((note) => note.id === id);
  if (!id || matching.length !== 1) throw new PlannerMoveError("Задача удалена или её нельзя однозначно определить. Обновите список; перенос не сохранён.");
  return matching[0];
};

const mergeMove = (original: PlannerNote, draft: PlannerNote, latest: PlannerNote) => {
  try { return mergePlannerDraft(original, draft, latest); }
  catch (error) {
    if (error instanceof PlannerDraftConflictError) throw new PlannerMoveError("Не удалось изменить день: дата или время задачи уже изменены в другом месте. Сохранённая версия не перезаписана. Для нового переноса перечитайте задачи и заново откройте выбор дня из меню.");
    throw error;
  }
};

export const applyPlannerMove = (notes: PlannerNote[], original: PlannerNote, target: Date) => {
  const latest = findCurrent(notes, original.id);
  const moved = movePlannerNoteToDay(original, target);
  if (moved === original && differenceInCalendarDays(getPlannerNoteDate(latest), target)) throw new PlannerMoveError("День задачи уже изменён в другом месте. Обновите список перед переносом.");
  const after = mergeMove(original, moved, latest);
  const changed = !samePlannerNote(latest, after);
  return { notes: changed ? notes.map((note) => note.id === original.id ? after : note) : notes, changed, before: latest, after };
};

export const undoPlannerMove = (notes: PlannerNote[], snapshot: PlannerMoveSnapshot) => {
  const latest = findCurrent(notes, snapshot.after.id);
  const after = mergeMove(snapshot.after, snapshot.before, latest);
  const changed = !samePlannerNote(latest, after);
  return { notes: changed ? notes.map((note) => note.id === after.id ? after : note) : notes, changed, after };
};
