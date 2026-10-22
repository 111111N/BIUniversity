import { describe, expect, it } from "vitest";
import { readAnalyticsNavigation, updateAnalyticsNavigation } from "./analyticsNavigation";

const memberships = [{ subjectId: "math", groupIds: ["a"] }, { subjectId: "physics", groupIds: ["b"] }];
const now = new Date("2026-10-22T12:00:00");

describe("analytics URL state", () => {
  it("restores the complete selected context", () => {
    const state = readAnalyticsNavigation(new URLSearchParams("subject=math&group=a&period=week&week=2026-10-19&grade=4&drill=2026-10-19&risks=all&attendanceSort=asc"), memberships, now);
    expect(state).toMatchObject({ subjectId: "math", groupId: "a", period: "week", selectedGrade: 1, drillWeek: "2026-10-19", showAllRisks: true, attendanceSort: "asc" });
    expect(state.selectedWeek.getDate()).toBe(19);
  });
  it("rejects unavailable groups, invalid dates and unknown values", () => {
    const state = readAnalyticsNavigation(new URLSearchParams("subject=math&group=b&period=bad&week=2026-02-31&grade=9&drill=2026-10-22"), memberships, now);
    expect(state).toMatchObject({ subjectId: "math", groupId: "all", period: "semester", selectedGrade: null, drillWeek: null });
    expect(state.selectedWeek.getDate()).toBe(22);
    expect(readAnalyticsNavigation(new URLSearchParams("subject=other&group=secret"), memberships, now)).toMatchObject({ subjectId: "all", groupId: "all" });
  });
  it("updates dependent filters atomically and preserves unrelated parameters", () => {
    const next = updateAnalyticsNavigation(new URLSearchParams("subject=physics&group=b&grade=5&custom=keep"), { subject: "math", group: null, grade: null, period: "semester" });
    expect(next.toString()).toBe("subject=math&custom=keep");
  });
});
