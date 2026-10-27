import { describe, expect, it } from "vitest";
import { getGroupHistoryPage, getGroupView, groupRegistrySearch, groupViewSearch } from "./presentation";
import type { GroupChange } from "../../domain/groupCatalog";

describe("group registry context", () => {
  it("preserves registry filters when opening and leaving a group without leaking roster parameters", () => {
    const source = new URLSearchParams("q=112&campus=3&status=archived&page=4");
    const selected = groupRegistrySearch(source, "group:one");
    selected.set("studentQ", "Иванов"); selected.set("studentPage", "2"); selected.set("asOf", "2026-10-27"); selected.set("rosterQ", "x"); selected.set("view", "history"); selected.set("historyPage", "3");
    expect(groupRegistrySearch(selected).toString()).toBe(source.toString());
    expect(source.has("group")).toBe(false); expect(selected.get("group")).toBe("group:one");
  });
  it("preserves the chosen date and roster filters through history, and keeps registry and current roster context", () => {
    const source = new URLSearchParams("group=one&q=112&page=4&studentQ=Иванов&studentPage=2&asOf=2026-09-01&roster=studying&rosterQ=Петров&rosterPage=3");
    const history = groupViewSearch(source, "history", "2026-10-27");
    history.set("historyPage", "4");
    expect(getGroupView(history)).toBe("history");
    const dated = groupViewSearch(history, "dated", "2026-10-27");
    expect(getGroupView(dated)).toBe("dated");
    expect(dated.get("asOf")).toBe("2026-09-01"); expect(dated.get("rosterQ")).toBe("Петров"); expect(dated.get("rosterPage")).toBe("3");
    const current = groupViewSearch(dated, "current", "2026-10-27");
    expect(getGroupView(current)).toBe("current");
    expect(current.has("asOf")).toBe(false); expect(current.has("rosterQ")).toBe(false);
    expect(current.get("studentQ")).toBe("Иванов"); expect(current.get("studentPage")).toBe("2"); expect(current.get("page")).toBe("4");
    expect(groupRegistrySearch(history, "two").get("historyPage")).toBeNull();
    expect(source.has("view")).toBe(false);
  });
  it("keeps old dated URLs working and only initializes a missing date", () => {
    expect(getGroupView(new URLSearchParams("asOf=2026-10-01"))).toBe("dated");
    expect(groupViewSearch(new URLSearchParams("group=one"), "dated", "2026-10-27").get("asOf")).toBe("2026-10-27");
    expect(groupViewSearch(new URLSearchParams("asOf="), "dated", "2026-10-27").get("asOf")).toBe("");
  });
  it("makes history beyond the former 50 entries reachable without changing order or source data", () => {
    const entries: GroupChange[] = Array.from({ length: 63 }, (_, index) => ({ id: `event:${index}`, groupId: "one", actorId: "admin", occurredAt: "2026-10-27T09:00:00Z", action: "updated" }));
    expect(getGroupHistoryPage(entries, "3").entries.map((entry) => entry.id)).toEqual(entries.slice(40, 60).map((entry) => entry.id));
    const last = getGroupHistoryPage(entries, "999");
    expect(last).toMatchObject({ page: 4, pages: 4, start: 60 }); expect(last.entries).toHaveLength(3);
    expect(getGroupHistoryPage(entries, "-1").page).toBe(1); expect(getGroupHistoryPage(entries, "bad").page).toBe(1);
    expect(entries).toHaveLength(63); expect(entries[0].id).toBe("event:0");
    expect(getGroupHistoryPage([], "2")).toMatchObject({ page: 1, pages: 1, entries: [] });
  });
});
