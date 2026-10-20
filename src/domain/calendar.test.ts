import { describe, expect, it } from "vitest";
import { getCalendarMonthDays, getDayInMonth } from "./calendar";

describe("calendar navigation", () => {
  it("fills complete Monday-to-Sunday weeks including adjacent months", () => {
    const days = getCalendarMonthDays(new Date(2026, 9, 1));
    expect(days).toHaveLength(35);
    expect(days[0]).toEqual(new Date(2026, 8, 28));
    expect(days.at(-1)).toEqual(new Date(2026, 10, 1));
  });

  it("keeps six rows when a month does not fit in five", () => {
    const days = getCalendarMonthDays(new Date(2026, 2, 1));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(1);
    expect(days.at(-1)?.getDay()).toBe(0);
  });

  it("clamps the focused day to February without skipping to March", () => {
    expect(getDayInMonth(new Date(2026, 0, 31), new Date(2026, 1, 1))).toEqual(new Date(2026, 1, 28));
    expect(getDayInMonth(new Date(2028, 0, 31), new Date(2028, 1, 1))).toEqual(new Date(2028, 1, 29));
  });

  it("preserves the day across year boundaries", () => {
    expect(getDayInMonth(new Date(2026, 11, 15), new Date(2027, 0, 1))).toEqual(new Date(2027, 0, 15));
  });
});
