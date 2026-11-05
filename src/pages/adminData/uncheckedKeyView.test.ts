import { describe, expect, it } from "vitest";
import { emptyUncheckedKeyQuery, getUncheckedKeyPage, searchUncheckedKeys } from "./uncheckedKeyView";

const keys = Array.from({ length: 205 }, (_, index) => `bi-university-future-module:${index}`);
describe("unreviewed archive key pagination", () => {
  it("reaches the final keys beyond 200 without mutating or sorting the source", () => {
    const before = [...keys];
    expect(getUncheckedKeyPage(keys, { search: "", page: 21 })).toEqual({ total: 205, pages: 21, page: 21, rows: keys.slice(200) });
    expect(keys).toEqual(before);
  });
  it("searches all keys independently of the currently visible page", () => {
    expect(getUncheckedKeyPage(keys, searchUncheckedKeys("FUTURE module:204")).rows).toEqual([keys[204]]);
    expect(searchUncheckedKeys("future").page).toBe(1);
  });
  it("distinguishes no matches from an empty inventory without changing the original count", () => {
    expect(getUncheckedKeyPage(keys, searchUncheckedKeys("not-found"))).toEqual({ total: 0, pages: 1, page: 1, rows: [] });
    expect(getUncheckedKeyPage([], emptyUncheckedKeyQuery())).toEqual({ total: 0, pages: 1, page: 1, rows: [] });
    expect(getUncheckedKeyPage(keys, emptyUncheckedKeyQuery()).total).toBe(205);
  });
  it("clamps obsolete and invalid pages without skipping the first or last match", () => {
    for (const page of [-1, 0, 0.5, NaN, Infinity]) expect(getUncheckedKeyPage(keys, { search: "", page }).page).toBe(1);
    expect(getUncheckedKeyPage(keys, { search: "module:204", page: 21 }).rows).toEqual([keys[204]]);
  });
  it("preserves literal key text while supporting whitespace-only searches", () => {
    const unusual = ['bi-university-<script>alert("x")</script>', "bi-university-модуль:+%2F"];
    expect(getUncheckedKeyPage(unusual, searchUncheckedKeys(" ")).rows).toEqual(unusual);
    expect(getUncheckedKeyPage(unusual, searchUncheckedKeys("МОДУЛЬ")).rows).toEqual([unusual[1]]);
  });
});
