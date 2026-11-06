import { describe, expect, it } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import { matchesFilters } from "./taskFilters";

const task = (category: "study" | "personal", completed: boolean) => ({ category, completed }) as PlannerNote;

describe("planner status and category filters", () => {
  it("combines independent status and category choices", () => {
    expect(matchesFilters(task("study", false), "active", "study")).toBe(true);
    expect(matchesFilters(task("study", true), "active", "study")).toBe(false);
    expect(matchesFilters(task("personal", false), "active", "study")).toBe(false);
    expect(matchesFilters(task("personal", true), "completed", "personal")).toBe(true);
  });
  it("the all choice does not constrain its axis", () => {
    expect(matchesFilters(task("personal", true), "all", "personal")).toBe(true);
    expect(matchesFilters(task("study", false), "active", "all")).toBe(true);
  });
});
