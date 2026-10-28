import { describe, expect, it } from "vitest";
import { CHECKS_RETURN_PARAM, createChecksReturn, getCheckResultId, inheritChecksReturn, readCheckResultAnchor, readChecksReturn, validateChecksReturn, withChecksReturn } from "./administrationChecksNavigation";
import { changesAdminAccount, changesAdminSubject, changesLocation, createUnsavedChangesRegistry } from "./unsavedNavigation";
import { groupRegistrySearch } from "../pages/adminGroups/presentation";

describe("navigation from data checks to corrective editing", () => {
  it("keeps search, filters, the actual result page and a safely encoded issue anchor", () => {
    const href = createChecksReturn("?q=Иванов+%26+112&kind=student-number&level=action&page=999&checksReturn=bad", 3, "number:student & one");
    const url = new URL(href, "https://portal.invalid");
    expect(url.searchParams.get("q")).toBe("Иванов & 112"); expect(url.searchParams.get("kind")).toBe("student-number");
    expect(url.searchParams.get("level")).toBe("action"); expect(url.searchParams.get("page")).toBe("3"); expect(url.searchParams.has(CHECKS_RETURN_PARAM)).toBe(false);
    expect(readCheckResultAnchor(url.hash)).toBe(getCheckResultId("number:student & one")); expect(validateChecksReturn(href)).toBe(href);
  });

  it("retains the exact corrective target and replaces any former return context", () => {
    const back = createChecksReturn("?level=review", 1, "subject:math");
    const destination = withChecksReturn("/admin/accounts?account=student%20%26%20one&mode=education&checksReturn=old", back);
    const url = new URL(destination, "https://portal.invalid");
    expect(url.searchParams.get("account")).toBe("student & one"); expect(url.searchParams.get("mode")).toBe("education");
    expect(url.searchParams.getAll(CHECKS_RETURN_PARAM)).toEqual([back]);
    expect(readChecksReturn(url.pathname, url.search)).toBe(back);
    expect(readChecksReturn("/schedule", url.search)).toBeNull();
    expect(readChecksReturn(url.pathname, `${url.search}&checksReturn=${encodeURIComponent(back)}`)).toBeNull();
  });

  it.each([
    "https://example.test/admin/checks", "//example.test/admin/checks", "javascript:alert(1)",
    "/admin/checks/other", "/admin/../admin/checks", "/admin/checks?next=https://example.test", "/admin/checks?checksReturn=/admin/checks",
    "/admin/checks?q=one&q=two", "/admin/checks?page=0", "/admin/checks?page=bad", "/admin/checks?page=1.5",
    "/admin/checks#unknown", "/admin/checks#admin-check-%XX", "/admin/checks\\example.test", "/admin/checks\n",
  ])("does not offer an untrusted or malformed return destination: %s", (value) => {
    expect(validateChecksReturn(value)).toBeNull();
    expect(readChecksReturn("/admin/groups", `?checksReturn=${encodeURIComponent(value)}`)).toBeNull();
  });

  it("does not add a return link to an invalid report value or use an external corrective destination", () => {
    expect(withChecksReturn("/admin/groups?group=one", "https://example.test")).toBe("/admin/groups?group=one");
    expect(withChecksReturn("https://example.test/admin/groups", "/admin/checks")).toBe("/admin/checks");
    expect(validateChecksReturn(`/admin/checks?q=${"x".repeat(8200)}`)).toBeNull();
  });

  it("keeps report context when changing a group section or returning to its registry", () => {
    const back = createChecksReturn("?q=112&level=review", 2, "group:one");
    const current = new URL(withChecksReturn("/admin/groups?group=one&campus=3&view=history", back), "https://portal.invalid");
    const registry = groupRegistrySearch(current.searchParams);
    expect(registry.has("group")).toBe(false); expect(registry.get("campus")).toBe("3");
    expect(readChecksReturn("/admin/groups", registry.toString())).toBe(back);
  });
  it("carries context from a group into account creation, import and back to the group", () => {
    const back = createChecksReturn("?kind=empty-group&level=review", 2, "group:one");
    const group = new URL(withChecksReturn("/admin/groups?group=one", back), "https://portal.invalid");
    for (const href of ["/admin/accounts?create=student&group=one", "/admin/accounts/import?group=one&from=group"]) {
      const target = new URL(inheritChecksReturn(href, group.pathname, group.search), "https://portal.invalid");
      expect(readChecksReturn(target.pathname, target.search)).toBe(back);
      expect(target.searchParams.get("group")).toBe("one");
      const returned = new URL(inheritChecksReturn("/admin/groups?group=one", target.pathname, target.search), "https://portal.invalid");
      expect(readChecksReturn(returned.pathname, returned.search)).toBe(back);
    }
  });
  it("does not carry report filters into unrelated sections, external links or an ordinary editing visit", () => {
    const search = `?checksReturn=${encodeURIComponent("/admin/checks?q=Иванов")}`;
    for (const href of ["/admin/teachers", "/schedule", "https://example.test"]) expect(inheritChecksReturn(href, "/admin/groups", search)).toBe(href);
    expect(inheritChecksReturn("/admin/accounts?account=one", "/admin/groups", "?group=one")).toBe("/admin/accounts?account=one");
  });

  it("keeps the existing unsaved-input guard on the explicit return path", () => {
    const back = createChecksReturn("?kind=student-number", 1, "student:one");
    for (const [path, check] of [["/admin/accounts?account=one&mode=education", changesAdminAccount], ["/admin/subjects?subject=math", changesAdminSubject], ["/admin/groups?group=one", changesLocation], ["/admin/schedule?group=one&date=2026-10-26", changesLocation]] as const) {
      const registry = createUnsavedChangesRegistry();
      const unregister = registry.register(check);
      const currentLocation = new URL(withChecksReturn(path, back), "https://portal.invalid");
      const nextLocation = new URL(back, "https://portal.invalid");
      expect(registry.shouldBlock({ currentLocation, nextLocation })).toBe(true);
      unregister(); expect(registry.shouldBlock({ currentLocation, nextLocation })).toBe(false);
    }
  });
});
