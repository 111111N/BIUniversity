import { describe, expect, it } from "vitest";
import { getVisibleRadarMaximum } from "./radarScale";

describe("radar scale for visible series", () => {
  const series = [{ values: [30, 24, 18] }, { values: [1, 3, 2] }, { values: [0, 0, 0] }];
  it("rescales from 30 to 3 and restores 30 when the large series returns", () => {
    const enabled = new Map([[0, true], [1, true], [2, true]]);
    expect(getVisibleRadarMaximum(series, enabled)).toBe(30);
    enabled.set(0, false);
    expect(getVisibleRadarMaximum(series, enabled)).toBe(3);
    enabled.set(0, true);
    expect(getVisibleRadarMaximum(series, enabled)).toBe(30);
  });
  it("keeps a valid scale when only zero values remain or all series are hidden", () => {
    expect(getVisibleRadarMaximum(series, new Map([[0, false], [1, false]]))).toBe(1);
    expect(getVisibleRadarMaximum(series, new Map([[0, false], [1, false], [2, false]]))).toBe(1);
    expect(getVisibleRadarMaximum([], new Map())).toBe(1);
  });
  it("ignores invalid values instead of breaking SVG coordinates", () => {
    expect(getVisibleRadarMaximum([{ values: [NaN, Infinity, -20, 3] }], new Map())).toBe(3);
  });
});
