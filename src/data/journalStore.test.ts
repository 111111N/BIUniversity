import { describe, expect, it } from "vitest";
import { createDemoJournal, decodeJournal, journalKey } from "./journalStore";

describe("journalStore", () => {
  it("isolates journals by subject and group", () => {
    expect(journalKey("data-analysis", "112-mko")).not.toBe(journalKey("data-analysis", "113-mko"));
    expect(journalKey("data-analysis", "112-mko")).not.toBe(journalKey("discrete-mathematics", "112-mko"));
  });

  it("creates stable demo data with the current student in their group", () => {
    expect(createDemoJournal("data-analysis", "112-mko")).toEqual(createDemoJournal("data-analysis", "112-mko"));
    expect(createDemoJournal("data-analysis", "112-mko").some((student) => student.id === "anna-smirnova")).toBe(true);
  });

  it("rejects malformed or duplicate saved records", () => {
    expect(decodeJournal("not-json")).toBeNull();
    expect(decodeJournal(JSON.stringify([{ id: "1", name: "A", attendance: {}, grades: {} }, { id: "1", name: "B", attendance: {}, grades: {} }]))).toBeNull();
    expect(decodeJournal(JSON.stringify([{ id: "1", name: "A", attendance: { "2026-09-04": "unknown" }, grades: {} }]))).toBeNull();
  });
});
