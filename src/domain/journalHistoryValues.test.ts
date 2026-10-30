import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJournalHistoryValueIssues } from "./journalHistoryValues";
import type { JournalChange } from "../data/journalStore";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { journalBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("History inspection must not infer current people, lessons or journal values"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => vi.unstubAllGlobals());
type Values = Pick<JournalChange, "field" | "previousValue" | "nextValue">;
const cell = (field: "attendance" | "grade", previousValue: JournalChange["previousValue"], nextValue: JournalChange["nextValue"]) => ({ field, previousValue, nextValue, lessonId: "legacy-lesson" });

describe("archived journal history values", () => {
  it.each([
    cell("attendance", "unmarked", "present"), cell("attendance", "present", "sick"), cell("attendance", "sick", "absent"), cell("attendance", "absent", "unmarked"),
    cell("grade", null, 2), cell("grade", 2, 3), cell("grade", 3, 4), cell("grade", 4, 5), cell("grade", 5, null), cell("grade", null, null),
  ])("accepts supported cell values without replacing the historical lesson: %j", (row) => {
    const before = JSON.stringify(row); expect(getJournalHistoryValueIssues(Object.freeze(row))).toEqual([]); expect(JSON.stringify(row)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it.each<Values>([
    { field: "roster", previousValue: null, nextValue: "added" }, { field: "roster", previousValue: "active", nextValue: "removed" },
    { field: "roster", previousValue: "PRIVATE OLD NAME", nextValue: "PRIVATE NEW NAME" }, { field: "roster", previousValue: "", nextValue: "PRIVATE NAME" },
    { field: "demo", previousValue: null, nextValue: "PRIVATE DEMO DESCRIPTION" }, { field: "demo", previousValue: null, nextValue: "" },
  ])("accepts roster snapshots and demo descriptions as stored: %j", (row) => {
    expect(getJournalHistoryValueIssues(row)).toEqual([]); expect(forbidden).not.toHaveBeenCalled();
  });

  it.each([
    cell("attendance", 5, "present"), cell("attendance", null, "present"), cell("attendance", "present", null), cell("attendance", "present", "PRIVATE STATUS"),
    cell("grade", "5", 4), cell("grade", 4, "PRIVATE GRADE"), cell("grade", 1, 2), cell("grade", 2, 6), cell("grade", 3.5, 4), cell("grade", 4, 3.5),
    { field: "roster", previousValue: null, nextValue: "PRIVATE NAME" }, { field: "roster", previousValue: 1, nextValue: "removed" },
    { field: "demo", previousValue: "PRIVATE OLD", nextValue: "PRIVATE DESCRIPTION" }, { field: "demo", previousValue: null, nextValue: 3 },
  ] as const)("reports values incompatible with their field without exposing them: %j", (row) => {
    const before = JSON.stringify(row); const findings = getJournalHistoryValueIssues(row);
    expect(findings).toEqual([expect.objectContaining({ code: "invalid-history-values", level: "error" })]);
    expect(JSON.stringify(findings)).not.toContain("PRIVATE"); expect(JSON.stringify(row)).toBe(before);
  });

  it.each(["attendance", "grade"] as const)("keeps old %s events without a lesson readable but unverified", async (field) => {
    const fixture = journalBackupFixture(); fixture.changes[0].field = field;
    fixture.changes[0].previousValue = field === "grade" ? null : "unmarked"; fixture.changes[0].nextValue = field === "grade" ? 5 : "present";
    delete fixture.changes[0].lessonId; fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 8, invalid: 0, errors: 0, reviews: 1 });
    expect(review.issues).toEqual([expect.objectContaining({ code: "missing-history-lesson", level: "review", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });

  it.each(["roster", "demo"] as const)("reviews a lesson link on %s without deleting it", (field) => {
    const findings = getJournalHistoryValueIssues({ field, lessonId: "PRIVATE LESSON", previousValue: null, nextValue: field === "roster" ? "added" : "PRIVATE DESCRIPTION" });
    expect(findings).toEqual([expect.objectContaining({ code: "unexpected-history-lesson", level: "review" })]); expect(JSON.stringify(findings)).not.toContain("PRIVATE");
  });

  it("keeps readable schema and complete record counts separate from semantic errors", async () => {
    const fixture = journalBackupFixture(); fixture.changes[0].field = "grade"; fixture.changes[0].previousValue = null; fixture.changes[0].nextValue = "PRIVATE INVALID GRADE"; fixture.save();
    const before = JSON.stringify(fixture.archive); const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.checks).toContainEqual(expect.objectContaining({ kind: "journalHistory", status: "valid", records: 1 }));
    expect(review.counts).toMatchObject({ valid: 8, invalid: 0, errors: 1 });
    expect(review.issues).toEqual([expect.objectContaining({ kind: "journalHistory", code: "invalid-history-values", referenceId: fixture.historyKey, recordId: "change-1" })]);
    expect(JSON.stringify(fixture.archive)).toBe(before); expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(forbidden).not.toHaveBeenCalled();
  });

  it("does not inspect a valid subset of a structurally broken list as a complete history", async () => {
    const fixture = journalBackupFixture(); fixture.changes[0].nextValue = "PRIVATE BAD STATUS";
    fixture.archive.localStorage.find((entry) => entry.key === fixture.historyKey)!.raw = JSON.stringify([fixture.changes[0], { id: "broken" }]);
    const review = await inspectBackupJournals(fixture.archive.localStorage);
    expect(review.issues).toEqual([expect.objectContaining({ code: "invalid-journal-document" })]);
    expect(review.checks[1].status).toBe("invalid"); expect(review.checks[1].records).toBeUndefined();
  });

  it("retains separate event IDs beyond 200 and cancels within a single large history list", async () => {
    const fixture = journalBackupFixture(); fixture.changes = Array.from({ length: 250 }, (_, index) => ({ ...fixture.changes[0], id: `change-${index}`, nextValue: "PRIVATE INVALID STATUS" }));
    const entry = { key: fixture.historyKey, raw: JSON.stringify(fixture.changes) }; const review = await inspectBackupJournals([entry]);
    expect(review.issues).toHaveLength(250); expect(review.issues.at(-1)?.recordId).toBe("change-249");
    expect(review.checks[1]).toMatchObject({ status: "valid", records: 250 }); expect(JSON.stringify(review)).not.toContain("PRIVATE");
    const controller = new AbortController(); const pending = inspectBackupJournals([entry], controller.signal); const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    expect(forbidden).not.toHaveBeenCalled();
  });
});
