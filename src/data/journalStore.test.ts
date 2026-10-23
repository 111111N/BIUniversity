import { describe, expect, it, vi } from "vitest";
import { createDemoJournal, decodeJournal, journalKey } from "./journalStore";
import * as lessonSource from "./lessons";

describe("journalStore", () => {
  it("isolates journals by subject and group", () => {
    expect(journalKey("data-analysis", "112-mko")).not.toBe(journalKey("data-analysis", "113-mko"));
    expect(journalKey("data-analysis", "112-mko")).not.toBe(journalKey("discrete-mathematics", "112-mko"));
  });

  it("creates stable demo data with the current student in their group", () => {
    expect(createDemoJournal("data-analysis", "112-mko")).toEqual(createDemoJournal("data-analysis", "112-mko"));
    expect(createDemoJournal("data-analysis", "112-mko").some((student) => student.id === "anna-smirnova")).toBe(true);
  });

  it("never generates attendance or grades for managed lessons", () => {
    const original = lessonSource.createSubjectLessons("data-analysis", "112-mko");
    const baseline = createDemoJournal("data-analysis", "112-mko");
    const spy = vi.spyOn(lessonSource, "createSubjectLessons").mockReturnValue([...original, { ...original[0], id: "managed:new-published-lesson", state: "completed" }]);
    try { expect(createDemoJournal("data-analysis", "112-mko")).toEqual(baseline); }
    finally { spy.mockRestore(); }
  });

  it("rejects malformed or duplicate saved records", () => {
    expect(decodeJournal("not-json")).toBeNull();
    expect(decodeJournal(JSON.stringify([{ id: "1", name: "A", attendance: {}, grades: {} }, { id: "1", name: "B", attendance: {}, grades: {} }]))).toBeNull();
    expect(decodeJournal(JSON.stringify([{ id: "1", name: "A", attendance: { "2026-09-04": "unknown" }, grades: {} }]))).toBeNull();
  });
});
