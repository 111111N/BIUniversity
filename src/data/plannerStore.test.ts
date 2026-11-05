import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendPlannerDemoNotes, getPlannerStorageKey, readPlannerState, updatePlannerNotes, type PlannerNote } from "./plannerStore";
import { applyPlannerMove } from "../domain/plannerMove";

const saved = new Map<string, string>();
beforeEach(() => {
  saved.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("planner account isolation", () => {
  const task: PlannerNote = { id: "private", title: "Private task", text: "", createdAt: new Date("2026-10-23T12:00:00"), completed: false, priority: "medium", category: "personal" };
  it("retains legacy teacher tasks without exposing them to a new teacher", () => {
    appendPlannerDemoNotes([task]);
    expect(getPlannerStorageKey("teacher-elena-volkova")).toBe("bi-university-demo-planner");
    expect(readPlannerState().notes).toHaveLength(1);
    expect(readPlannerState("new-teacher").notes).toEqual([]);
    appendPlannerDemoNotes([{ ...task, id: "new-private" }], "new-teacher");
    expect(readPlannerState("new-teacher").notes[0].id).toBe("new-private");
    expect(readPlannerState().notes[0].id).toBe("private");
  });
});

describe("planner transfer persistence", () => {
  const task: PlannerNote = { id: "task", title: "Задача", text: "", createdAt: new Date(2026, 9, 26), startAt: new Date(2026, 9, 26, 9), endAt: new Date(2026, 9, 26, 10), completed: false, priority: "medium", category: "personal" };
  it("updates only the selected owner's store with the latest independent edits", () => {
    saved.set(getPlannerStorageKey("owner"), JSON.stringify([{ ...task, title: "Изменено извне" }]));
    saved.set(getPlannerStorageKey("other"), JSON.stringify([task])); const other = saved.get(getPlannerStorageKey("other"));
    updatePlannerNotes("owner", (notes) => applyPlannerMove(notes, task, new Date(2026, 9, 28)).notes);
    expect(readPlannerState("owner").notes[0].title).toBe("Изменено извне");
    expect(readPlannerState("owner").notes[0].startAt).toEqual(new Date(2026, 9, 28, 9));
    expect(saved.get(getPlannerStorageKey("other"))).toBe(other);
  });
  it("does not write or emit an event for a same-day transfer", () => {
    saved.set(getPlannerStorageKey("owner"), JSON.stringify([task]));
    const write = vi.spyOn(localStorage, "setItem");
    updatePlannerNotes("owner", (notes) => applyPlannerMove(notes, task, new Date(2026, 9, 26)).notes);
    expect(write).not.toHaveBeenCalled(); expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
  it.each(["startAt", "endAt"] as const)("blocks writes instead of dropping a damaged optional %s", (field) => {
    const raw = JSON.stringify([{ ...task, [field]: "PRIVATE invalid date" }]); saved.set(getPlannerStorageKey("owner"), raw);
    vi.spyOn(console, "error").mockImplementation(() => {}); const write = vi.spyOn(localStorage, "setItem");
    expect(readPlannerState("owner").error).not.toBe("");
    expect(() => updatePlannerNotes("owner", () => [])).toThrow("Сохранение отменено");
    expect(saved.get(getPlannerStorageKey("owner"))).toBe(raw); expect(write).not.toHaveBeenCalled();
  });
  it("retains the persisted task after a write failure and reports the error", () => {
    const raw = JSON.stringify([task]); saved.set(getPlannerStorageKey("owner"), raw);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("Quota"); });
    expect(() => updatePlannerNotes("owner", (notes) => applyPlannerMove(notes, task, new Date(2026, 9, 28)).notes)).toThrow("Quota");
    expect(log).toHaveBeenCalledOnce(); expect(saved.get(getPlannerStorageKey("owner"))).toBe(raw); expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
});
