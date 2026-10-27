import { describe, expect, it } from "vitest";
import { addGroupSelection, getGroupSelectionView, SELECTED_GROUPS_PER_PAGE } from "./selection";

const options = Array.from({ length: 100 }, (_, index) => ({ value: `g${index}`, label: `${index + 1}-Группа` }));
describe("large group selection", () => {
  it("adds only matching unselected groups and preserves unavailable selected groups", () => {
    const view = getGroupSelectionView(options.slice(0, 3), ["archived", "g0"], [{ value: "archived", label: "Архивная группа" }], "2-Группа", "", 1);
    expect(view.additions.map((option) => option.value)).toEqual(["g1"]);
    expect(addGroupSelection(["archived", "g0"], view.additions)).toEqual(["archived", "g0", "g1"]);
    expect(view.unavailable).toBe(1); expect(view.selected[0].label).toBe("Архивная группа");
  });
  it("bounds the selected list and searches across all hundred selected groups", () => {
    const ids = options.map((option) => option.value);
    const page = getGroupSelectionView(options, ids, [], "", "", 2);
    expect(page.shown).toHaveLength(SELECTED_GROUPS_PER_PAGE); expect(page.shown[0].value).toBe(`g${SELECTED_GROUPS_PER_PAGE}`);
    const filtered = getGroupSelectionView(options, ids, [], "", "100-Группа", 20);
    expect(filtered.page).toBe(1); expect(filtered.filteredCount).toBe(1); expect(filtered.shown[0].value).toBe("g99");
    expect(ids).toHaveLength(100);
  });
  it("clamps the current page after removal and retains labels outside available options", () => {
    const result = getGroupSelectionView([], ["unknown"], [], "", "", 99);
    expect(result.page).toBe(1); expect(result.shown[0].label).toContain("unknown"); expect(result.additions).toEqual([]);
    expect(getGroupSelectionView([], [], [], "", "", 0).shown).toEqual([]);
  });
  it("deduplicates bulk addition without modifying the input", () => {
    const source = ["g0", "archived"];
    expect(addGroupSelection(source, [options[0], options[1], options[1]])).toEqual(["g0", "archived", "g1"]);
    expect(source).toEqual(["g0", "archived"]);
  });
});
