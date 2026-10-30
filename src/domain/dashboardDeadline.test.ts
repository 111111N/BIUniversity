import { describe, expect, it } from "vitest";
import { formatDashboardDeadline } from "./dashboard";

describe("dashboard deadline labels", () => {
  const now = new Date("2026-10-29T12:00:00");

  it("shows the submission time for dates beyond tomorrow", () => {
    const label = formatDashboardDeadline("2026-11-05T09:30:00", now);
    expect(label).toContain("5 ноября");
    expect(label).toContain("09:30");
    expect(label).not.toContain("2026");
  });

  it("includes the year for a distant deadline in another year", () => {
    const label = formatDashboardDeadline("2027-01-05T18:45:00", now);
    expect(label).toContain("5 января 2027");
    expect(label).toContain("18:45");
  });

  it.each([
    ["2026-12-31T23:00:00", "Сегодня, 23:00"],
    ["2027-01-01T09:00:00", "Завтра, 09:00"],
    ["2026-12-30T18:00:00", "Просрочено со вчера"],
    ["2026-12-29T18:00:00", "Просрочено на 2 дн."],
  ])("keeps relative wording across the year boundary for %s", (deadline, expected) => {
    expect(formatDashboardDeadline(deadline, new Date("2026-12-31T12:00:00"))).toBe(expected);
  });
});
