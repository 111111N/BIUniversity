import { describe, expect, it } from "vitest";
import { getTimeWheelDirection } from "./wheelStep";

describe("single time wheel step", () => {
  it.each([1, 38, 100, 300])("moves one value regardless of wheel delta %s", (delta) => {
    expect(getTimeWheelDirection(delta, 0, false)).toBe(1);
    expect(getTimeWheelDirection(-delta, 0, false)).toBe(-1);
  });
  it("leaves horizontal gestures and browser zoom unchanged", () => {
    expect(getTimeWheelDirection(1, 10, false)).toBe(0);
    expect(getTimeWheelDirection(100, 0, true)).toBe(0);
    expect(getTimeWheelDirection(0, 0, false)).toBe(0);
  });
});
