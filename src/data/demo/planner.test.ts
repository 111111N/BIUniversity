import { describe, expect, it } from "vitest";
import { createPlannerDemo } from "./learning";

describe("planner demo week identity", () => {
  it("keeps IDs stable within a local week and independent between weeks", () => {
    const monday = createPlannerDemo(new Date(2026, 10, 9));
    const sunday = createPlannerDemo(new Date(2026, 10, 15, 23, 59));
    expect(monday.map((note) => note.id)).toEqual(sunday.map((note) => note.id));
    const previousIds = new Set(createPlannerDemo(new Date(2026, 10, 2)).map((note) => note.id));
    expect(monday.every((note) => !previousIds.has(note.id))).toBe(true);
    expect(new Set(monday.map((note) => note.id)).size).toBe(monday.length);
    expect(monday[0].createdAt).toEqual(new Date(2026, 10, 9));
  });
  it("preserves the overnight task interval and creates examples for the next week", () => {
    const notes = createPlannerDemo(new Date(2026, 10, 9));
    const overnight = notes.find((note) => note.title === "Вечерняя подготовка презентации");
    expect(overnight?.startAt).toEqual(new Date(2026, 10, 15, 23));
    expect(overnight?.endAt).toEqual(new Date(2026, 10, 16, 1));
    expect(notes.some((note) => note.createdAt.getTime() === new Date(2026, 10, 16).getTime())).toBe(true);
  });
});
