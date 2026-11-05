import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { inspectArchivedStudentNumbers } from "./backupStudentNumbers";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { previewStudentNumber, type StudentRecord } from "./studentRecord";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import DocumentReview from "../pages/adminData/DocumentReview";

const forbidden = vi.fn(() => { throw new Error("Student counter inspection must not access current data or allocate numbers"); });
beforeEach(() => {
  forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden });
  vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden });
});
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const record = (sequence = 12, campus = 3, year = 2026): StudentRecord => ({ number: `${year}${campus}${String(sequence).padStart(4, "0")}`, year, campus, sequence, issuedAt: `${year}-01-01T09:00:00.000Z` });
const fixture = () => {
  const state = coreBackupFixture(); state.accounts.accounts[2].studentRecord = record();
  return state;
};

describe("archived student number counters", () => {
  it.each([undefined, {}])("reports a missing year/campus counter without repairing a legacy document: %j", async (counters) => {
    const state = fixture(); state.accounts.studentNumberCounters = counters;
    const before = JSON.stringify(state.accounts);
    const review = await inspectArchivedStudentNumbers(state.accounts);
    expect(review.issues).toEqual([expect.objectContaining({ kind: "accounts", level: "review", code: "missing-student-number-counter", recordId: "2026:3" })]);
    expect(JSON.stringify(state.accounts)).toBe(before); expect(JSON.stringify(review)).not.toContain("202630012");
  });
  it.each([0, 1, 11])("reports a lagging counter %i while leaving the existing safe preview unchanged", async (saved) => {
    const state = fixture(); state.accounts.studentNumberCounters = { "2026:3": saved };
    const before = previewStudentNumber(state.accounts, 3, "2026-11-03T09:00:00.000Z");
    expect((await inspectArchivedStudentNumbers(state.accounts)).issues).toEqual([expect.objectContaining({ code: "lagging-student-number-counter", recordId: "2026:3" })]);
    expect(previewStudentNumber(state.accounts, 3, "2026-11-03T09:00:00.000Z")).toEqual(before);
    expect(before.number).toBe("202630013"); expect(state.accounts.studentNumberCounters["2026:3"]).toBe(saved);
  });
  it.each([12, 50])("accepts a counter at or above the surviving maximum: %i", async (saved) => {
    const state = fixture(); state.accounts.studentNumberCounters = { "2026:3": saved, "2025:1": 85 };
    const before = JSON.stringify(state.accounts);
    expect((await inspectArchivedStudentNumbers(state.accounts)).issues).toEqual([]);
    expect(JSON.stringify(state.accounts)).toBe(before);
  });
  it("compares each year/campus independently and retains numbers on former or blocked student accounts", async () => {
    const state = fixture(); state.accounts.accounts[2].role = "teacher"; state.accounts.accounts[2].status = "blocked";
    state.accounts.studentNumberCounters = { "2026:1": 900, "2025:3": 900 };
    const review = await inspectArchivedStudentNumbers(state.accounts);
    expect(review.issues).toEqual([expect.objectContaining({ code: "missing-student-number-counter", recordId: "2026:3" })]);
    expect(review.summary).toContain("областей года и корпуса: 3");
  });
  it.each([undefined, 9998, 9999])("counts exhaustion once for an issued maximum when saved counter is %s", async (saved) => {
    const state = fixture(); state.accounts.accounts[2].studentRecord = record(9999);
    state.accounts.studentNumberCounters = saved === undefined ? {} : { "2026:3": saved };
    expect((await inspectArchivedStudentNumbers(state.accounts)).summary).toContain("областей с исчерпанной нумерацией: 1");
  });
  it("keeps counters without current records, including exhausted scopes, and leaves empty old documents quiet", async () => {
    const state = coreBackupFixture(); expect(await inspectArchivedStudentNumbers(state.accounts)).toEqual({ issues: [], summary: "" });
    state.accounts.studentNumberCounters = { "2026:3": 9999 };
    const review = await inspectArchivedStudentNumbers(state.accounts);
    expect(review.issues).toEqual([]); expect(review.summary).toContain("областей с исчерпанной нумерацией: 1");
    expect(state.accounts.studentNumberCounters["2026:3"]).toBe(9999);
  });
  it("exposes the finding in document details without classifying the readable account schema as invalid", async () => {
    const state = fixture(); state.save(); const before = JSON.stringify(state.archive);
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 4, invalid: 0, reviews: 1, errors: 0 });
    const html = renderToStaticMarkup(createElement(DocumentReview, { review }));
    expect(html).toContain("счётчик их года и корпуса отсутствует"); expect(html).toContain("проверить: 1");
    expect(html).not.toContain("202630012"); expect(html).not.toContain("Анна Смирнова");
    expect(JSON.stringify(state.archive)).toBe(before);
  });
  it("does not inspect a readable subset of an invalid accounts document or substitute counters from the browser", async () => {
    const state = fixture(); state.accounts.studentNumberCounters = { "2026:3": -1 }; state.save();
    const review = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(review.checks[0].status).toBe("invalid");
    expect(review.issues.some((issue) => issue.code.includes("student-number-counter"))).toBe(false);
  });
  it("preserves all scopes after 200 and supports cancellation", async () => {
    const state = fixture(); const source = state.accounts.accounts[2];
    state.accounts.accounts = Array.from({ length: 205 }, (_, index) => ({ ...source, id: `student-${index}`, login: `student-${index}`, studentRecord: record(1, index % 9 + 1, 2000 + Math.floor(index / 9)) }));
    expect((await inspectArchivedStudentNumbers(state.accounts)).issues).toHaveLength(205);
    const controller = new AbortController(); const pending = inspectArchivedStudentNumbers(state.accounts, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
