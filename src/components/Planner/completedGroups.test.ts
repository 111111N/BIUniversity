import { describe, expect, it } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import { expandMatchingCompletedDays } from "./completedGroups";

const note = (day: number, title: string, completed = true): PlannerNote => ({ id: `${day}-${title}`, title, text: "", createdAt: new Date(2026, 10, day), completed, priority: "medium", category: "study" });

describe("completed planner groups", () => {
  const notes = [note(3, "Экзамен"), note(4, "Реферат"), note(5, "Экзамен", false)];
  it("expands matching completed days without losing other days' manual state", () => {
    expect(expandMatchingCompletedDays({ "2026-11-04": false }, notes, "экзамен")).toEqual({ "2026-11-04": false, "2026-11-03": true });
  });
  it("leaves manually closed groups alone on filter changes and empty searches", () => {
    const open = { "2026-11-03": false };
    expect(expandMatchingCompletedDays(open, notes, "")).toBe(open);
    expect(expandMatchingCompletedDays(open, notes, "реферат")).toEqual({ "2026-11-03": false, "2026-11-04": true });
  });
});
