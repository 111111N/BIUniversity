import { describe, expect, it } from "vitest";
import { readNotificationFilters, updateNotificationFilters } from "./notificationNavigation";

describe("notification history navigation", () => {
  it("restores a bookmarked search and validates filter values", () => {
    expect(readNotificationFilters(new URLSearchParams("read=unread&kind=grade&q=оценка"))).toEqual({ filter: "unread", kind: "grade", query: "оценка" });
    expect(readNotificationFilters(new URLSearchParams("read=bad&kind=unknown"))).toEqual({ filter: "all", kind: "all", query: "" });
  });
  it("preserves other parameters and clears only history filters on reset", () => {
    const current = new URLSearchParams("from=cabinet&read=unread&kind=grade&q=работа");
    const next = updateNotificationFilters(current, { kind: "revision" });
    expect(next.get("q")).toBe("работа");
    expect(next.get("from")).toBe("cabinet");
    expect(next.get("kind")).toBe("revision");
    expect(current.get("kind")).toBe("grade");
    expect(updateNotificationFilters(next, { filter: "all", kind: "all", query: "" }).toString()).toBe("from=cabinet");
  });
});
