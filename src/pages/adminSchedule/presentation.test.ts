import { describe, expect, it } from "vitest";
import { getWeekActionState, groupScheduleLessons } from "./presentation";
import type { ManagedLesson } from "../../domain/scheduleManagement";

const base = { dirty: false, editorOpen: false, hasDraft: false, published: false, conflicts: 0, stale: false, busy: false, blockedReason: "" };
describe("week action presentation", () => {
  it("asks for a draft before the first publication, including an empty week", () => {
    expect(getWeekActionState(base)).toMatchObject({ action: "save", disabled: false, status: "Новая неделя" });
  });
  it("never offers publication of unsaved changes", () => {
    expect(getWeekActionState({ ...base, hasDraft: true, dirty: true })).toMatchObject({ action: "save", disabled: false, status: "Есть правки недели" });
  });
  it("offers a review of the saved draft rather than immediate publication", () => {
    expect(getWeekActionState({ ...base, hasDraft: true, published: true })).toMatchObject({ action: "publish", disabled: false, label: "Проверить и опубликовать", status: "Черновик сохранён" });
    expect(getWeekActionState({ ...base, published: true }).status).toBe("Опубликовано");
  });
  it.each([
    { editorOpen: true }, { stale: true }, { busy: true }, { blockedReason: "Группа в архиве." },
  ])("explains why a week action is unavailable: %o", (state) => {
    const result = getWeekActionState({ ...base, ...state });
    expect(result.disabled).toBe(true); expect(result.hint).toBeTruthy();
  });
  it("allows saving conflicts but prevents publishing them", () => {
    expect(getWeekActionState({ ...base, conflicts: 3 }).disabled).toBe(false);
    expect(getWeekActionState({ ...base, hasDraft: true, conflicts: 3 })).toMatchObject({ disabled: true, hint: "Исправьте конфликты в парах перед публикацией." });
  });
});
describe("days of the working week", () => {
  it("sorts days and time without changing source order or lesson identities", () => {
    const entries = [{ id: "late", date: "2026-10-28", startsAt: "12:00" }, { id: "early", date: "2026-10-28", startsAt: "08:30" }, { id: "first", date: "2026-10-26", startsAt: "09:00" }] as ManagedLesson[];
    const result = groupScheduleLessons(entries);
    expect(result.map((day) => day.date)).toEqual(["2026-10-26", "2026-10-28"]);
    expect(result[1].lessons.map((lesson) => lesson.id)).toEqual(["early", "late"]);
    expect(result[1].lessons[0]).toBe(entries[1]); expect(entries[0].id).toBe("late");
    expect(groupScheduleLessons([])).toEqual([]);
  });
});
