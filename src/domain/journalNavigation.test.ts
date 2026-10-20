import { describe, expect, it } from "vitest";
import { changeJournalSection, getAssignmentHref, getJournalSection } from "./journalNavigation";

describe("journal navigation", () => {
  it("opens the assignment section from a direct link and restricts history to teachers", () => {
    expect(getJournalSection(new URLSearchParams("assignment=task-1"))).toBe("assignments");
    expect(getJournalSection(new URLSearchParams("tab=history"))).toBe("journal");
    expect(getJournalSection(new URLSearchParams("tab=history"), true)).toBe("history");
    expect(getJournalSection(new URLSearchParams("tab=unknown"))).toBe("journal");
  });

  it("clears the selected assignment when changing sections without losing other parameters", () => {
    const current = new URLSearchParams("tab=assignments&assignment=task-1&submission=answer-1&period=autumn");
    const next = changeJournalSection(current, "materials");
    expect(next.toString()).toBe("tab=materials&period=autumn");
    expect(current.get("assignment")).toBe("task-1");
    expect(changeJournalSection(current, "journal").toString()).toBe("period=autumn");
  });

  it("encodes assignment and answer IDs as data, not additional query parameters", () => {
    const href = getAssignmentHref({ id: "task & special", subjectId: "data-analysis", groupId: "112-mko" }, "answer/1?tab=history");
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/journal/data-analysis/112-mko");
    expect(url.searchParams.get("tab")).toBe("assignments");
    expect(url.searchParams.get("assignment")).toBe("task & special");
    expect(url.searchParams.get("submission")).toBe("answer/1?tab=history");
    expect(getAssignmentHref({ id: "missing", subjectId: "unknown", groupId: "112-mko" })).toBe("/journal");
  });
});
