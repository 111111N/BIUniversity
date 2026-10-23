import { describe, expect, it } from "vitest";
import { readFileFilters, readHistoryFilters, readMaterialScope, updateFileFilters, updateHistoryFilters } from "./libraryNavigation";

describe("library navigation", () => {
  it("opens group materials by default while preserving explicit shared and legacy group links", () => {
    expect(readMaterialScope(new URLSearchParams())).toBe("group");
    expect(readMaterialScope(new URLSearchParams("materials=group"))).toBe("group");
    expect(readMaterialScope(new URLSearchParams("materials=subject"))).toBe("subject");
    expect(readMaterialScope(new URLSearchParams("materials=invalid"))).toBe("group");
  });
  it("restores file filters including categories absent from the initial loading list", () => {
    const params = new URLSearchParams("tab=materials&materials=group&fileQ=конспект&fileCategory=Книга&fileSort=size");
    expect(readFileFilters(params)).toEqual({ query: "конспект", category: "Книга", sort: "size" });
    expect(readFileFilters(new URLSearchParams("fileSort=unknown&fileCategory="))).toEqual({ query: "", category: "Все", sort: "date" });
  });
  it("changes and resets file filters atomically without removing the journal or history context", () => {
    const params = new URLSearchParams("tab=materials&materials=group&lessonType=practice&historyType=grade&historyQ=Иван&fileQ=old&fileSort=name&fileCategory=Книга");
    const updated = updateFileFilters(params, { query: "", category: "Все" });
    expect(readFileFilters(updated)).toEqual({ query: "", category: "Все", sort: "name" });
    expect(updated.get("historyQ")).toBe("Иван");
    expect(updated.get("materials")).toBe("group");
    expect(updated.get("lessonType")).toBe("practice");
    expect(params.get("fileQ")).toBe("old");
    expect(updated.has("fileCategory")).toBe(false);
    expect(updateFileFilters(updated, { sort: "date" }).has("fileSort")).toBe(false);
  });
  it("restores history filters and the expanded batch limit", () => {
    expect(readHistoryFilters(new URLSearchParams("historyQ=Иван&historyType=grade&historyLimit=24"))).toEqual({ query: "Иван", filter: "grade", limit: 24 });
    for (const limit of ["", "0", "-8", "7", "201", "Infinity", "NaN", "8.5"]) {
      expect(readHistoryFilters(new URLSearchParams(`historyType=invalid&historyLimit=${limit}`))).toEqual({ query: "", filter: "all", limit: 8 });
    }
  });
  it("keeps file filters and parent context when filtering or resetting history", () => {
    const params = new URLSearchParams("tab=history&mode=grades&fileQ=Книга&fileSort=size&historyLimit=24");
    const changed = updateHistoryFilters(params, { query: "Петров", filter: "attendance", limit: 8 });
    expect(readHistoryFilters(changed)).toEqual({ query: "Петров", filter: "attendance", limit: 8 });
    expect(changed.get("fileQ")).toBe("Книга");
    expect(changed.get("tab")).toBe("history");
    expect(changed.get("mode")).toBe("grades");
    const reset = updateHistoryFilters(changed, { query: "", filter: "all", limit: 8 });
    expect([...reset.keys()].filter((key) => key.startsWith("history"))).toEqual([]);
    expect(params.get("historyLimit")).toBe("24");
  });
});
