import { describe, expect, it, vi } from "vitest";
import type { PlannerNote } from "../../data/plannerStore";
import { createPlannerTaskDrag, PLANNER_DRAG_TYPE } from "./taskDrag";
import { toLocalDateKey } from "../../domain/schedule";

const note: PlannerNote = { id: "private-id", title: "Private title", text: "", createdAt: new Date(2026, 10, 2), completed: false, category: "personal", priority: "low" };
const scope = "2026-11-02:board";
const data = (token = "opaque") => ({ types: [PLANNER_DRAG_TYPE], getData: vi.fn(() => token) });
describe("planner drag session boundary", () => {
  it("accepts one internal drop on another day and retains the original snapshot", () => {
    const gesture = createPlannerTaskDrag(note, scope, "opaque");
    expect(gesture.accepts(scope, "2026-11-03", [PLANNER_DRAG_TYPE])).toBe(true);
    const target = gesture.drop(scope, "2026-11-03", data());
    expect(target && toLocalDateKey(target)).toBe("2026-11-03");
    expect(gesture.note).toBe(note);
    expect(gesture.drop(scope, "2026-11-04", data())).toBeNull();
  });
  it.each(["2026-11-09:board", "2026-11-02:list", "another-owner"])("rejects a stale context %s even with its original token", (otherScope) => {
    const gesture = createPlannerTaskDrag(note, scope, "opaque");
    expect(gesture.accepts(otherScope, "2026-11-03", [PLANNER_DRAG_TYPE])).toBe(false);
    expect(gesture.drop(otherScope, "2026-11-03", data())).toBeNull();
  });
  it.each(["2026-11-02", "2026-02-30", "not-a-date"])("rejects an unchanged or invalid destination %s", (day) => {
    const gesture = createPlannerTaskDrag(note, scope, "opaque");
    expect(gesture.accepts(scope, day, [PLANNER_DRAG_TYPE])).toBe(false);
    expect(gesture.drop(scope, day, data())).toBeNull();
  });
  it("does not interpret file/text drops as task transfers", () => {
    const gesture = createPlannerTaskDrag(note, scope, "opaque"); const external = { ...data(), types: ["Files", "text/plain"] };
    expect(gesture.drop(scope, "2026-11-03", external)).toBeNull();
    expect(external.getData).not.toHaveBeenCalled();
  });
  it("rejects a forged token and a cancelled gesture", () => {
    const gesture = createPlannerTaskDrag(note, scope, "opaque");
    expect(gesture.drop(scope, "2026-11-03", data(note.id))).toBeNull();
    const cancelled = createPlannerTaskDrag(note, scope, "opaque"); cancelled.cancel();
    expect(cancelled.drop(scope, "2026-11-03", data())).toBeNull();
  });
});
