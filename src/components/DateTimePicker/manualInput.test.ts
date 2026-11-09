import { describe, expect, it } from "vitest";
import { getCalendarMonthDays } from "../../domain/calendar";
import { formatPickerDateText, formatPickerTimeText, parsePickerDateText, parsePickerTimeText } from "./manualInput";

describe("manual picker input", () => {
  it("accepts the requested date and locates the same day in the visual calendar", () => {
    const date = parsePickerDateText("24.11.2026")!;
    expect(formatPickerDateText(date)).toBe("24.11.2026");
    expect(getCalendarMonthDays(date).some((day) => day.getFullYear() === date.getFullYear() && day.getMonth() === date.getMonth() && day.getDate() === 24)).toBe(true);
    expect(formatPickerDateText(parsePickerDateText("24112026"))).toBe("24.11.2026");
  });
  it.each(["", "24.11.", "31.11.2026", "29.02.2026", "00.11.2026", "24.13.2026", "24/11/2026"])("does not roll over or commit an invalid/incomplete date: %s", (text) => {
    expect(parsePickerDateText(text)).toBeUndefined();
  });
  it("preserves leap days and changes of month/year", () => {
    expect(formatPickerDateText(parsePickerDateText("29.02.2028"))).toBe("29.02.2028");
    expect(formatPickerDateText(parsePickerDateText("01.01.2027"))).toBe("01.01.2027");
  });
  it.each([["00:00", 0, 0], ["23:59", 23, 59], ["1240", 12, 40], ["9:05", 9, 5]] as const)("maps %s to wheel values and a canonical clock", (text, hours, minutes) => {
    expect(parsePickerTimeText(text)).toEqual({ hours, minutes });
    expect(parsePickerTimeText(formatPickerTimeText(hours, minutes))).toEqual({ hours, minutes });
  });
  it.each(["", "12:", "24:00", "23:60", "-1:30", "9999", "12.30"])("rejects invalid/incomplete time: %s", (text) => {
    expect(parsePickerTimeText(text)).toBeUndefined();
  });
});
