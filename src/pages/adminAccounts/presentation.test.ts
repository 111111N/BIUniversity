import { describe, expect, it } from "vitest";
import { getAccountHistoryPage, getAccountSections, resolveAccountEditorMode } from "./presentation";
import type { AccountChange } from "../../domain/accounts";

describe("account editor sections", () => {
  it("separates education and assignments from personal details and access", () => {
    expect(getAccountSections("student").map((section) => section.value)).toEqual(["details", "education", "access", "history"]);
    expect(getAccountSections("teacher").map((section) => section.value)).toEqual(["details", "assignments", "access", "history"]);
    expect(getAccountSections("configurator").map((section) => section.value)).toEqual(["details", "access", "history"]);
  });
  it("keeps old role links and rejects sections belonging to another account type", () => {
    expect(resolveAccountEditorMode("role", "student")).toBe("role");
    expect(resolveAccountEditorMode("education", "student")).toBe("education");
    expect(resolveAccountEditorMode("education", "teacher")).toBe("details");
    expect(resolveAccountEditorMode("assignments", "student")).toBe("details");
    expect(resolveAccountEditorMode("missing", "configurator")).toBe("details");
  });
  it("makes audit entries older than 50 reachable, clamping invalid pages without changing source order", () => {
    const entries: AccountChange[] = Array.from({ length: 61 }, (_, index) => ({ id: `audit:${index}`, accountId: "student", actorId: "admin", action: "details-changed", occurredAt: "2026-10-27T09:00:00Z", previousRole: "student", nextRole: "student" }));
    expect(getAccountHistoryPage(entries, "3").entries.map((entry) => entry.id)).toEqual(entries.slice(40, 60).map((entry) => entry.id));
    expect(getAccountHistoryPage(entries, "999")).toMatchObject({ page: 4, pages: 4, start: 60, entries: [entries[60]] });
    expect(getAccountHistoryPage(entries, "bad").page).toBe(1); expect(getAccountHistoryPage(entries, "-1").page).toBe(1);
    expect(getAccountHistoryPage([], "2")).toMatchObject({ page: 1, entries: [] });
    expect(entries).toHaveLength(61); expect(entries[0].id).toBe("audit:0");
  });
});
