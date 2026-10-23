import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendPlannerDemoNotes, getPlannerStorageKey, readPlannerState, type PlannerNote } from "./plannerStore";

const saved = new Map<string, string>();
beforeEach(() => {
  saved.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
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
