import { describe, expect, it } from "vitest";
import { withPlannerDate, withoutPlannerTask } from "./params";

describe("planner selected day URL", () => {
  it("selects another day without discarding unrelated parameters and closes a task link", () => {
    const current = new URLSearchParams("date=2026-11-02&task=task-1&source=calendar");
    const next = withPlannerDate(current, new Date(2026, 10, 4));
    expect(next.toString()).toBe("date=2026-11-04&source=calendar");
    expect(current.get("date")).toBe("2026-11-02");
  });
  it("corrects a task deep link's day while retaining its task until the form closes", () => {
    const next = withPlannerDate(new URLSearchParams("date=2026-11-02&task=task-1&source=calendar"), new Date(2026, 10, 5), false);
    expect(next.toString()).toBe("date=2026-11-05&task=task-1&source=calendar");
    expect(withoutPlannerTask(next).toString()).toBe("date=2026-11-05&source=calendar");
  });
});
