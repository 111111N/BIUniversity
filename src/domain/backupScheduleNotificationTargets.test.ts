import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedScheduleHref } from "./backupScheduleNotificationTargets";
import { createArchivedNotificationTargetCheck } from "./backupNotificationTargets";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { notificationTargetBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Archived links must not open pages or use current data"); });
beforeEach(() => {
  forbidden.mockClear();
  vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden });
  vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("open", forbidden);
});
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived schedule notification selectors", () => {
  it.each([
    "/schedule", "/schedule?date=2026-10-30", "/schedule?date=2024-02-29",
    "/schedule?type=group&query=112-%D0%9C%D0%9A%D0%BE", "/schedule?type=auditory&query=101&date=2026-10-30",
    "/schedule?type=teacher&query=Иванов+И.И.", "/schedule?query=%252F&type=group",
    "/schedule?tab=%FF&tab=other#date=PRIVATE", "/schedule?%64ate=2026-10-30&unknown=%FF",
  ])("reads supported selectors without substituting a current date or resolving names: %s", (href) => {
    expect(inspectArchivedScheduleHref(href)).toBe("readable");
  });

  it.each([
    "/schedule?date=2026-02-29", "/schedule?date=2026-13-01", "/schedule?date=30.10.2026",
    "/schedule?date=", "/schedule?date=2026-10-30&date=2026-10-30",
    "/schedule?date=2026-10-30&%64ate=2026-11-01", "/schedule?date=%FF", "/schedule?%FF=value",
    "/schedule?type=group", "/schedule?query=112", "/schedule?type=unknown&query=112",
    "/schedule?type=group&query=+", "/schedule?type=group&query=%FF",
    "/schedule?type=group&type=group&query=112", "/schedule?type=group&query=112&query=113",
    "/schedule/", "/schedule/lesson-1",
  ])("keeps ambiguous selectors unresolved instead of using the page's fallback: %s", (href) => {
    expect(inspectArchivedScheduleHref(href)).toBe("ambiguous");
  });

  it.each(["/journal", "/planner?date=2026-10-30", "/BIUniversity/schedule?date=2026-10-30", "/schedule-other"])("leaves other routes outside this check: %s", (href) => {
    expect(inspectArchivedScheduleHref(href)).toBe("outside");
  });

  it("reports readable selectors separately from matched academic targets and does not claim a lesson or access", async () => {
    const check = await createArchivedNotificationTargetCheck(); const finding = vi.fn();
    check.inspect("/schedule?type=teacher&query=PRIVATE", finding);
    expect(finding).not.toHaveBeenCalled();
    expect(check.summary()).toContain("Целей заданий и ответов: 0");
    expect(check.summary()).toContain("Ссылок расписания: 1; формат читается: 1; не подтверждён: 0");
    expect(check.summary()).toContain("не подтверждает наличие занятий, результат поиска или права получателя");
    expect(check.summary()).not.toContain("PRIVATE");
  });

  it("adds a review finding through the document inspection without changing or revealing the archived URL", async () => {
    const state = notificationTargetBackupFixture();
    state.notifications[0].href = "/schedule?date=PRIVATE&type=teacher&query=PRIVATE"; state.save();
    const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.issues.filter((issue) => issue.kind === "notifications")).toEqual([
      expect.objectContaining({ level: "review", code: "ambiguous-notification-schedule-target" }),
    ]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE");
    expect(JSON.stringify(state.archive)).toBe(before);
    expect(review.checks.find((check) => check.kind === "notifications")!.status).toBe("valid");
  });

  it("preserves assignment-route ambiguity and counts mixed targets independently", async () => {
    const check = await createArchivedNotificationTargetCheck(); const finding = vi.fn();
    check.inspect("/schedule?assignment=PRIVATE", finding);
    expect(finding).toHaveBeenCalledWith("review", "ambiguous-notification-target", expect.any(String));
    finding.mockClear(); check.inspect("/schedule?date=2026-10-30", finding);
    check.inspect("/schedule?date=broken", finding);
    expect(check.summary()).toContain("Целей заданий и ответов: 1");
    expect(check.summary()).toContain("Ссылок расписания: 2; формат читается: 1; не подтверждён: 1");
    expect(finding).toHaveBeenCalledExactlyOnceWith("review", "ambiguous-notification-schedule-target", expect.any(String));
  });

  it("honours cancellation before inspecting a schedule link", async () => {
    const controller = new AbortController(); const check = await createArchivedNotificationTargetCheck({}, controller.signal);
    controller.abort(); const finding = vi.fn();
    expect(() => check.inspect("/schedule?date=2026-10-30", finding)).toThrow();
    expect(finding).not.toHaveBeenCalled();
  });
});
