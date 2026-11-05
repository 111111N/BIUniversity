import { describe, expect, it } from "vitest";
import type { PlannerNote } from "../data/plannerStore";
import { applyPlannerMove, movePlannerNoteToDay, shiftPlannerDates, undoPlannerMove } from "./plannerMove";

const note = (): PlannerNote => ({ id: "task-1", title: "Задача", text: "Описание", createdAt: new Date(2026, 9, 26), startAt: new Date(2026, 9, 26, 9, 15, 2, 3), endAt: new Date(2026, 9, 27, 11, 30, 4, 5), completed: false, category: "study", priority: "high" });
describe("planner day transfer", () => {
  it("shifts both timestamps by calendar days while preserving their times and other fields", () => {
    const original = note(); const before = JSON.stringify(original);
    const moved = movePlannerNoteToDay(original, new Date(2027, 0, 2, 15));
    expect(moved.startAt).toEqual(new Date(2027, 0, 2, 9, 15, 2, 3));
    expect(moved.endAt).toEqual(new Date(2027, 0, 3, 11, 30, 4, 5));
    expect(moved.createdAt).toBe(original.createdAt);
    expect({ ...moved, startAt: undefined, endAt: undefined }).toEqual({ ...original, startAt: undefined, endAt: undefined });
    expect(JSON.stringify(original)).toBe(before);
  });
  it("keeps untimed tasks untimed and moves an optional deadline by the same offset", () => {
    const original = { ...note(), startAt: undefined, endAt: new Date(2026, 9, 29, 23, 59) };
    const moved = movePlannerNoteToDay(original, new Date(2026, 10, 2));
    expect(moved.startAt).toBeUndefined(); expect(moved.createdAt).toEqual(new Date(2026, 10, 2));
    expect(moved.endAt).toEqual(new Date(2026, 10, 5, 23, 59));
    expect(movePlannerNoteToDay({ ...original, endAt: undefined }, new Date(2026, 10, 2)).endAt).toBeUndefined();
  });
  it("preserves a missing end and does not reserve or generate an ID", () => {
    const moved = movePlannerNoteToDay({ ...note(), endAt: undefined }, new Date(2026, 9, 28));
    expect(moved.endAt).toBeUndefined(); expect(moved.id).toBe("task-1");
  });
  it("uses the same date shift for unsaved form values, including temporary ordering errors", () => {
    const startAt = new Date(2026, 9, 26, 14); const endAt = new Date(2026, 9, 26, 13);
    const result = shiftPlannerDates({ day: startAt, startAt, endAt }, new Date(2026, 10, 1));
    expect(result.startAt).toEqual(new Date(2026, 10, 1, 14)); expect(result.endAt).toEqual(new Date(2026, 10, 1, 13));
  });
  it("rejects invalid dates and unsupported saved timing instead of repairing it", () => {
    expect(() => movePlannerNoteToDay(note(), new Date(NaN))).toThrow("день или время");
    expect(() => movePlannerNoteToDay({ ...note(), endAt: new Date(NaN) }, new Date())).toThrow("день или время");
    expect(() => movePlannerNoteToDay({ ...note(), endAt: new Date(2026, 9, 25) }, new Date(2026, 9, 28))).toThrow("позже начала");
    expect(() => movePlannerNoteToDay({ ...note(), startAt: undefined, endAt: new Date(2026, 9, 25) }, new Date(2026, 9, 28))).toThrow("раньше дня");
  });
  it("keeps a same-day request idempotent without allocating a new array", () => {
    const original = note(); const notes = [original]; const result = applyPlannerMove(notes, original, new Date(2026, 9, 26, 23));
    expect(result.changed).toBe(false); expect(result.notes).toBe(notes); expect(movePlannerNoteToDay(original, new Date(2026, 9, 26))).toBe(original);
  });
  it("merges independent text and completion changes while moving only the requested task", () => {
    const original = note(); const other = { ...note(), id: "other" };
    const latest = { ...original, title: "Обновлено", completed: true };
    const result = applyPlannerMove([latest, other], original, new Date(2026, 9, 28));
    expect(result.after.title).toBe("Обновлено"); expect(result.after.completed).toBe(true); expect(result.notes[1]).toBe(other);
    expect(result.before).toBe(latest); expect(result.after.startAt?.getDate()).toBe(28);
  });
  it("does not overwrite another temporal change, including a stale same-day request", () => {
    const original = note(); const latest = movePlannerNoteToDay(original, new Date(2026, 10, 1));
    expect(() => applyPlannerMove([latest], original, new Date(2026, 10, 2))).toThrow("дата или время");
    expect(() => applyPlannerMove([latest], original, new Date(2026, 9, 26))).toThrow("уже изменён");
  });
  it("does not recreate deleted tasks or choose a duplicate ID", () => {
    expect(() => applyPlannerMove([], note(), new Date())).toThrow("удалена");
    expect(() => applyPlannerMove([note(), note()], note(), new Date())).toThrow("однозначно");
  });
  it("undoes only the schedule while preserving later independent edits", () => {
    const original = note(); const moved = applyPlannerMove([original], original, new Date(2026, 10, 1));
    const latest = { ...moved.after, title: "Поздняя правка", priority: "low" as const, completed: true };
    const undone = undoPlannerMove([latest], moved);
    expect(undone.after.startAt).toEqual(original.startAt); expect(undone.after.endAt).toEqual(original.endAt);
    expect(undone.after).toMatchObject({ title: latest.title, priority: "low", completed: true });
    expect(undoPlannerMove(undone.notes, moved).changed).toBe(false);
  });
  it("refuses undo after another temporal edit or deletion", () => {
    const original = note(); const moved = applyPlannerMove([original], original, new Date(2026, 10, 1));
    const later = movePlannerNoteToDay(moved.after, new Date(2026, 10, 3));
    expect(() => undoPlannerMove([later], moved)).toThrow("дата или время");
    expect(() => undoPlannerMove([], moved)).toThrow("удалена");
  });
});
