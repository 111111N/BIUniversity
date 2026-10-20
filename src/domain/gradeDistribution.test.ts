import { describe, expect, it } from "vitest";
import { normalizeGradeShares } from "./gradeDistribution";

describe("normalizeGradeShares", () => {
  it("shows exactly 100 percent for the demo distribution", () => {
    const percentages = normalizeGradeShares([18, 34, 29, 11]);
    expect(percentages).toEqual([20, 37, 31, 12]);
    expect(percentages.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("handles empty and invalid counts", () => {
    expect(normalizeGradeShares([0, 0])).toEqual([0, 0]);
    expect(normalizeGradeShares([3, -2, Number.NaN])).toEqual([100, 0, 0]);
  });
});
