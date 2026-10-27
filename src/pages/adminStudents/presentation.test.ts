import { describe, expect, it } from "vitest";
import { getStudentPageSelection, toggleStudentPageSelection } from "./presentation";
import { getBatchApplyHint } from "../../components/BatchWorkflow/presentation";
describe("batch selection presentation", () => {
  it("counts selection outside the current page and preserves it when toggling this page", () => {
    const selected = new Set(["other", "one"]);
    expect(getStudentPageSelection(selected, ["one", "two"])).toEqual({ all: false, onPage: 1, offPage: 1, canToggle: true });
    const added = toggleStudentPageSelection(selected, ["one", "two"]);
    expect([...toggleStudentPageSelection(added, ["one", "two"])]).toEqual(["other"]);
    expect([...selected]).toEqual(["other", "one"]);
  });
  it("rejects an entire page exceeding the limit and still allows deselection", () => {
    const selected = new Set(Array.from({ length: 1000 }, (_, i) => String(i)));
    expect(getStudentPageSelection(selected, ["0", "extra"]).canToggle).toBe(false);
    expect(toggleStudentPageSelection(selected, ["0", "extra"])).toEqual(selected);
    expect(toggleStudentPageSelection(selected, ["0", "1"]).size).toBe(998);
  });
  it("accepts the exact limit and handles empty pages", () => {
    const selected = new Set(Array.from({ length: 999 }, (_, i) => String(i)));
    expect(toggleStudentPageSelection(selected, ["999", "999"]).size).toBe(1000);
    expect(getStudentPageSelection(new Set(), []).all).toBe(false);
  });
  it("explains stale, invalid and unchanged previews before applying a batch", () => {
    const base = { busy: false, blocked: false, stale: false, errors: 0, changed: 3 };
    expect(getBatchApplyHint({ ...base, stale: true })).toContain("Обновите");
    expect(getBatchApplyHint({ ...base, errors: 2 })).toContain("2");
    expect(getBatchApplyHint({ ...base, changed: 0 })).toContain("Нет новых");
    expect(getBatchApplyHint(base)).toContain("других страницах");
  });
});
