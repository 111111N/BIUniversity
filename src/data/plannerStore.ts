import { useCallback, useEffect, useState } from "react";
import { PlannerDraftConflictError } from "../domain/plannerDraft";

export interface PlannerNote {
  id: string;
  title: string;
  text: string;
  startAt?: Date;
  endAt?: Date;
  createdAt: Date;
  completed: boolean;
  priority: "low" | "medium" | "high";
  category: "study" | "personal";
}

const STORAGE_KEY = "bi-university-demo-planner";
const CHANGE_EVENT = "bi-university-planner-change";
export class PlannerWriteError extends Error {}
const validDate = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

export const readPlannerState = (): { notes: PlannerNote[]; error: string } => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { notes: [], error: "" };
    const payload: unknown = JSON.parse(saved);
    if (!Array.isArray(payload)) throw new Error("Invalid planner data");
    const notes = payload.flatMap((value): PlannerNote[] => {
      if (!value || typeof value !== "object") return [];
      const note = value as Record<string, unknown>;
      const createdAt = validDate(note.createdAt);
      if (typeof note.id !== "string" || typeof note.title !== "string" || !createdAt) return [];
      return [{ id: note.id, title: note.title, text: typeof note.text === "string" ? note.text : "", createdAt, startAt: validDate(note.startAt), endAt: validDate(note.endAt), completed: note.completed === true, priority: note.priority === "low" || note.priority === "high" ? note.priority : "medium", category: note.category === "personal" ? "personal" : "study" }];
    });
    if (notes.length !== payload.length || new Set(notes.map((note) => note.id)).size !== notes.length) return { notes, error: "В данных планировщика есть повреждённые записи. Сохранение приостановлено, чтобы не потерять задачи." };
    return { notes, error: "" };
  } catch {
    return { notes: [], error: "Не удалось прочитать задачи планировщика из браузера." };
  }
};

export const subscribePlannerStore = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === STORAGE_KEY) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
};

export const appendPlannerDemoNotes = (notes: PlannerNote[]) => {
  const current = readPlannerState();
  if (current.error) throw new PlannerWriteError(current.error);
  const ids = new Set(current.notes.map((note) => note.id));
  const added = notes.filter((note) => !ids.has(note.id));
  if (!added.length) return 0;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current.notes, ...added]));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return added.length;
};

export const usePlannerNotes = () => {
  const [state, setState] = useState(readPlannerState);
  const refreshNotes = useCallback(() => setState(readPlannerState()), []);
  useEffect(() => subscribePlannerStore(refreshNotes), [refreshNotes]);
  const setNotes = (update: PlannerNote[] | ((notes: PlannerNote[]) => PlannerNote[])) => {
    try {
      const current = readPlannerState();
      if (current.error) throw new PlannerWriteError(`${current.error} Сохранение отменено, чтобы не перезаписать данные.`);
      const notes = typeof update === "function" ? update(current.notes) : update;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setState({ notes, error: "" });
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof PlannerWriteError || error instanceof PlannerDraftConflictError ? error.message : "Не удалось сохранить изменения. Данные не изменены — повторите попытку." }));
      return false;
    }
  };
  return { notes: state.notes, error: state.error, setNotes, refreshNotes };
};
