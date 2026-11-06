import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteAccountComparison, compareBackupAccountRecords, getUncheckedAccountDocuments } from "./backupAccountComparison";
import { coreBackupFixture, studentOperationBackupFixture } from "../testSupport/localBackupDocuments";

const setup = () => studentOperationBackupFixture(undefined, { effectiveDate: "2026-10-28", basis: "PRIVATE BASIS", documentNumber: "PRIVATE NUMBER", documentDate: "2026-10-27" });
const forbidden = vi.fn(() => { throw new Error("Education comparison must not use live data"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("saved education events by permanent ID", () => {
  it("compares exact IDs with linked audit and operation validation without reading current accounts", async () => {
    const state = setup(); const before = JSON.stringify(state.archive); const result = await compareBackupAccountRecords(state.archive.localStorage, state.archive.localStorage);
    expect(result.educationComparisonVersion).toBe(1); expect(result.education?.counts).toMatchObject({ same: 1, different: 0 }); expect(JSON.stringify(state.archive)).toBe(before);
    expect(() => assertCompleteAccountComparison(result)).not.toThrow(); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("compares documents, dates and historical states without exposing their contents", async () => {
    const state = setup(); const original = structuredClone(state.archive.localStorage); const event = state.accounts.educationEvents![0];
    Object.assign(event, { basis: "PRIVATE NEW BASIS", documentNumber: "PRIVATE NEW NUMBER", documentDate: "2026-10-28", effectiveDate: "2026-10-27" });
    Object.assign(state.accounts.studentOperations![0].education!, { basis: event.basis, documentNumber: event.documentNumber, documentDate: event.documentDate, effectiveDate: event.effectiveDate });
    event.before!.groupName = "PRIVATE OLD GROUP"; event.after.groupName = "PRIVATE NEW GROUP"; state.save();
    const result = await compareBackupAccountRecords(original, state.archive.localStorage);
    expect(result.education?.differences[0]).toMatchObject({ fields: ["effectiveDate", "basis", "documentNumber", "documentDate", "before", "after"], reference: { collection: "education-events", key: "bi-university-accounts-v1", id: event.id } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(result)).not.toContain("2026-10-27");
  });
  it("does not merge events with different IDs even when their remaining contents match", async () => {
    const state = setup(); const original = structuredClone(state.archive.localStorage); const event = state.accounts.educationEvents![0];
    event.id = "education-another"; state.accounts.history[0].educationEventId = event.id; state.save();
    const result = await compareBackupAccountRecords(original, state.archive.localStorage);
    expect(result.education?.counts).toMatchObject({ same: 0, different: 0, new: 1, currentOnly: 1 });
  });
  it("flags a legacy missing source and never pretends that it contains no events", async () => {
    const state = coreBackupFixture(); const result = await compareBackupAccountRecords(state.archive.localStorage, []);
    expect(result.counts.comparedDocuments).toBe(1); expect(result.history?.counts.comparedDocuments).toBe(1);
    expect(result.education?.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0, new: 0, currentOnly: 0 });
    expect(result.education?.uncompared[0]).toMatchObject({ reason: "missing-education-history", source: "archive" }); expect(getUncheckedAccountDocuments(result)).toBe(1);
  });
  it("distinguishes explicit empty events from a missing source or missing document", async () => {
    const state = coreBackupFixture(); const missing = structuredClone(state.archive.localStorage); state.accounts.educationEvents = []; state.save();
    const empty = await compareBackupAccountRecords(state.archive.localStorage, []);
    expect(empty.education?.counts).toMatchObject({ comparedDocuments: 1, same: 0, new: 0, currentOnly: 0 }); expect(empty.education?.uncompared).toEqual([]);
    const unknown = await compareBackupAccountRecords(missing, state.archive.localStorage);
    expect(unknown.education?.counts.uncheckedDocuments).toBe(1); expect(unknown.education?.differences).toEqual([]);
    expect((await compareBackupAccountRecords([], [])).education?.counts.documents).toBe(0);
  });
  it.each(["audit-link", "operation-link", "duplicate-id", "future-date"])("rejects a whole source with inconsistent education: %s", async (mode) => {
    const state = setup(); const original = structuredClone(state.archive.localStorage); const event = state.accounts.educationEvents![0];
    if (mode === "audit-link") event.auditId = "missing-audit";
    if (mode === "operation-link") event.batchId = "missing-operation";
    if (mode === "duplicate-id") state.accounts.educationEvents!.push({ ...event });
    if (mode === "future-date") event.effectiveDate = "2027-01-01";
    state.save(); const result = await compareBackupAccountRecords(original, state.archive.localStorage);
    expect(result.education?.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0 }); expect(result.education?.differences).toEqual([]); expect(getUncheckedAccountDocuments(result)).toBe(1);
  });
  it("reports unknown properties without raw values", async () => {
    const state = setup(); const original = structuredClone(state.archive.localStorage); Object.assign(state.accounts.educationEvents![0], { "PRIVATE FIELD": { value: "PRIVATE VALUE" } }); state.save();
    const result = await compareBackupAccountRecords(original, state.archive.localStorage);
    expect(result.education?.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it.each(["missing-detail", "unknown-version", "missing-version", "wrong-collection", "truncated"])("rejects incomplete education details: %s", async (mode) => {
    const state = setup(); const result = await compareBackupAccountRecords(state.archive.localStorage, []);
    if (mode === "missing-detail") delete result.education;
    if (mode === "unknown-version") Object.assign(result, { educationComparisonVersion: 2 });
    if (mode === "missing-version") delete result.educationComparisonVersion;
    if (mode === "wrong-collection") Object.assign(result.education!.differences[0].reference!, { collection: "account-history" });
    if (mode === "truncated") result.education!.differences.pop();
    expect(() => assertCompleteAccountComparison(result)).toThrow("неполный отчёт");
  });
  it("supports old results without either education extension field", async () => {
    const state = setup(); const result = await compareBackupAccountRecords(state.archive.localStorage, []);
    delete result.education; delete result.educationComparisonVersion; expect(() => assertCompleteAccountComparison(result)).not.toThrow();
  });
});
