import { describe, expect, it } from "vitest";
import type { Assessment, AssessmentSnapshot } from "../../domain/assessmentTypes";
import { assessmentContext, assessmentContextChanged, displayDate, filterAssessments, outcomeValue, paginate, parseOutcome } from "./model";

describe("assessment workspace model", () => {
  it("blocks an editor when any source revision or the identity has changed", () => {
    const snapshot: AssessmentSnapshot = { revision: 1, actorRevision: 2, accountsRevision: 3, groupRevision: 4, subjectRevision: 5, assessments: [], groups: [], subjects: [], teachers: [], students: [] };
    const context = assessmentContext(snapshot, "configurator");
    expect(assessmentContextChanged(context, snapshot, "configurator")).toBe(false);
    for (const field of ["revision", "actorRevision", "accountsRevision", "groupRevision", "subjectRevision"] as const) expect(assessmentContextChanged(context, { ...snapshot, [field]: snapshot[field] + 1 }, "configurator")).toBe(true);
    expect(assessmentContextChanged(context, snapshot, "another-configurator")).toBe(true);
  });
  it("distinguishes no result, failed pass, absence and a grade of two", () => {
    for (const value of ["", "2", "3", "4", "5", "passed", "failed", "absent"]) expect(outcomeValue(parseOutcome(value))).toBe(value);
    expect(parseOutcome("absent")).not.toEqual(parseOutcome(""));
    expect(parseOutcome("2")).not.toEqual(parseOutcome("failed"));
    expect(() => parseOutcome("6")).toThrow("Неизвестный результат");
  });
  it("searches across academic context while preserving the selected type", () => {
    const items = [
      { id: "exam", title: "Математика", groupName: "112-МКО", subjectName: "Теория вероятностей", period: "2026/27", kind: "exam" },
      { id: "thesis", title: "Защита", groupName: "112-МКО", subjectName: null, period: "2026/27", kind: "thesis" },
    ] as Assessment[];
    expect(filterAssessments(items, "112", "exam").map((item) => item.id)).toEqual(["exam"]);
    expect(filterAssessments(items, "вероятностей", "").map((item) => item.id)).toEqual(["exam"]);
    expect(filterAssessments(items, "2026", "thesis").map((item) => item.id)).toEqual(["thesis"]);
  });
  it("keeps hundreds of records paged and clamps the page after filtering", () => {
    const items = Array.from({ length: 101 }, (_, id) => id);
    expect(paginate(items, 1)).toMatchObject({ pages: 6, total: 101, items: Array.from({ length: 20 }, (_, id) => id) });
    expect(paginate(items, 50)).toMatchObject({ page: 6, items: [100] });
    expect(paginate([], 4)).toMatchObject({ page: 1, pages: 1, items: [] });
  });
  it("displays an academic calendar date without converting time zones", () => { expect(displayDate("2026-11-06")).toBe("06.11.2026"); });
});
