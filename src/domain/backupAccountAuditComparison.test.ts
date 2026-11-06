import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as accountDomain from "./accounts";
import type { AccountChange, AccountsDocument } from "./accounts";
import { assertCompleteAccountComparison, compareBackupAccountRecords, getUncheckedAccountDocuments } from "./backupAccountComparison";
import { coreBackupFixture, studentImportBackupFixture, studentOperationBackupFixture } from "../testSupport/localBackupDocuments";

const KEY = "bi-university-accounts-v1";
const entry = (value: AccountsDocument) => ({ key: KEY, raw: JSON.stringify(value) });
const audit = (id = "audit-1"): AccountChange => ({ id, accountId: "student-1", actorId: "configurator-demo", occurredAt: "2026-10-28T09:00:00Z", action: "details-changed", previousRole: "student", nextRole: "student", changes: [{ field: "name", before: "PRIVATE BEFORE", after: "PRIVATE AFTER" }] });
const setup = () => { const state = coreBackupFixture(); state.accounts.history = [audit()]; return state; };
const forbidden = vi.fn(() => { throw new Error("Audit comparison must not access live data"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("archived account history comparison by event ID", () => {
  it("compares saved event IDs independent of array/property order without changing inputs", async () => {
    const { accounts } = setup(); accounts.history.push(audit("audit-2")); const original = entry(accounts);
    accounts.history.reverse(); accounts.history = accounts.history.map(row => Object.fromEntries(Object.entries(row).reverse()) as AccountChange);
    const current = entry(accounts); const before = JSON.stringify([original, current]);
    const review = await compareBackupAccountRecords([original], [current]);
    expect(review.historyComparisonVersion).toBe(1); expect(review.history?.counts).toMatchObject({ same: 2, different: 0 });
    expect(review.counts.same).toBe(3); expect(review.history?.differences).toEqual([]);
    expect(() => assertCompleteAccountComparison(review)).not.toThrow(); expect(JSON.stringify([original, current])).toBe(before);
  });
  it("compares all ordinary audit fields while exporting no saved values", async () => {
    const { accounts } = setup(); const original = entry(accounts);
    Object.assign(accounts.history[0], { accountId: "teacher-1", actorId: "teacher-1", occurredAt: "2026-10-29T09:00:00Z", action: "status-changed", previousRole: "teacher", nextRole: "teacher", previousMemberships: [], nextMemberships: [{ subjectId: "PRIVATE SUBJECT", groupIds: ["PRIVATE GROUP"] }], changes: [{ field: "PRIVATE FIELD", before: "PRIVATE OLD", after: "PRIVATE NEW" }] });
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts).toMatchObject({ same: 3, different: 0 });
    expect(review.history?.differences).toEqual([{ kind: "different", area: `История учёток · ${KEY}`, id: "audit-1", reference: { storage: "localStorage-record", key: KEY, collection: "account-history", id: "audit-1" }, fields: ["accountId", "actorId", "occurredAt", "action", "previousRole", "nextRole", "previousMemberships", "nextMemberships", "changes"] }]);
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("2026-10-29");
  });
  it.each(["import", "operation"])("compares an optional %s link without inventing history", async (kind) => {
    const state = kind === "import" ? studentImportBackupFixture() : studentOperationBackupFixture(); const original = entry(state.accounts);
    const field = kind === "import" ? "importBatchId" : "studentOperationBatchId";
    delete state.accounts.history[0][field];
    const review = await compareBackupAccountRecords([original], [entry(state.accounts)]);
    expect(review.history?.differences[0].fields).toEqual([field]); expect(review.history?.counts.different).toBe(1);
  });
  it("compares a changed education-event link only with a valid linked document", async () => {
    const state = studentOperationBackupFixture(undefined, { effectiveDate: "2026-10-28", basis: "PRIVATE BASIS" }); const original = entry(state.accounts);
    state.accounts.educationEvents![0].id = "education-revised"; state.accounts.history[0].educationEventId = "education-revised";
    const review = await compareBackupAccountRecords([original], [entry(state.accounts)]);
    expect(review.history?.differences[0].fields).toEqual(["educationEventId"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("does not match by target account, action, time or payload", async () => {
    const { accounts } = setup(); const original = entry(accounts); accounts.history = [audit("another-event")];
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.history?.counts).toMatchObject({ same: 0, different: 0, new: 1, currentOnly: 1 });
  });
  it("keeps account-card and event identities separate", async () => {
    const { accounts } = setup(); accounts.history[0].id = "student-1";
    const review = await compareBackupAccountRecords([entry(accounts)], []);
    expect(review.differences.some(row => row.id === "student-1")).toBe(true);
    expect(review.history?.differences[0].reference).toMatchObject({ collection: "account-history", id: "student-1" });
  });
  it.each(["duplicate", "blank-id"])("rejects ambiguous history without discarding rows: %s", async (kind) => {
    const { accounts } = setup(); const original = entry(accounts);
    if (kind === "duplicate") accounts.history.push({ ...audit(), accountId: "teacher-1" }); else accounts.history[0].id = "";
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts.same).toBe(3); expect(review.history?.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0, new: 0, currentOnly: 0 });
    expect(review.history?.differences).toEqual([]); expect(review.history?.uncompared).toEqual([{ key: KEY, source: "browser", reason: "invalid-document" }]); expect(getUncheckedAccountDocuments(review)).toBe(1);
  });
  it.each(["invalid-date", "missing-history", "broken-education-link"])("requires the full account document: %s", async (kind) => {
    const { accounts } = setup(); const original = entry(accounts);
    if (kind === "invalid-date") accounts.history[0].occurredAt = "PRIVATE INVALID";
    if (kind === "missing-history") Reflect.deleteProperty(accounts, "history");
    if (kind === "broken-education-link") accounts.history[0].educationEventId = "missing-event";
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts.uncheckedDocuments).toBe(1); expect(review.history?.counts.uncheckedDocuments).toBe(1);
    expect(getUncheckedAccountDocuments(review)).toBe(1); expect(review.history?.differences).toEqual([]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("distinguishes absent, saved empty, duplicate and unsupported sources", async () => {
    const { accounts } = setup(); const original = entry(accounts); accounts.history = [];
    expect((await compareBackupAccountRecords([original], [entry(accounts)])).history?.counts.new).toBe(1);
    expect((await compareBackupAccountRecords([], [entry(accounts)])).history?.counts).toMatchObject({ comparedDocuments: 1, currentOnly: 0 });
    expect((await compareBackupAccountRecords([], [])).history?.counts.documents).toBe(0);
    expect((await compareBackupAccountRecords([original, original], [])).history?.uncompared[0].reason).toBe("duplicate-key");
    const future = await compareBackupAccountRecords([{ ...original, key: "bi-university-accounts-v2" }], [original]);
    expect(future.history?.counts).toMatchObject({ currentOnly: 1, uncheckedDocuments: 1 }); expect(future.history?.uncompared[0].reason).toBe("unsupported-key");
  });
  it("preserves unknown field differences without exporting their names or values", async () => {
    const { accounts } = setup(); const original = entry(accounts); Object.assign(accounts.history[0], { "PRIVATE EXTRA": { value: "PRIVATE VALUE" } });
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.history?.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("retains the whole result beyond a UI page and rejects incomplete or misaddressed history", async () => {
    const { accounts } = setup(); accounts.history = Array.from({ length: 230 }, (_, index) => audit(`audit-${String(index).padStart(3, "0")}`));
    const review = await compareBackupAccountRecords([entry(accounts)], []);
    expect(review.history?.differences).toHaveLength(230); expect(review.history?.differences.at(-1)?.id).toBe("audit-229"); expect(() => assertCompleteAccountComparison(review)).not.toThrow();
    const wrong = structuredClone(review); Object.assign(wrong.history!.differences[0].reference!, { collection: "accounts" }); expect(() => assertCompleteAccountComparison(wrong)).toThrow("неполный отчёт");
    review.history!.differences.pop(); expect(() => assertCompleteAccountComparison(review)).toThrow("неполный отчёт");
  });
  it.each(["missing-detail", "unknown-version", "missing-version"])("rejects incomplete versioned history: %s", async (kind) => {
    const { accounts } = setup(); const review = await compareBackupAccountRecords([entry(accounts)], []);
    if (kind === "missing-detail") delete review.history;
    if (kind === "unknown-version") Object.assign(review, { historyComparisonVersion: 2 });
    if (kind === "missing-version") delete review.historyComparisonVersion;
    expect(() => assertCompleteAccountComparison(review)).toThrow("неполный отчёт");
  });
  it("continues to accept old results without history detail or its version", async () => {
    const { accounts } = setup(); const review = await compareBackupAccountRecords([entry(accounts)], []);
    delete review.history; delete review.historyComparisonVersion;
    delete review.education; delete review.educationComparisonVersion;
    expect(() => assertCompleteAccountComparison(review)).not.toThrow(); expect(getUncheckedAccountDocuments(review)).toBe(0);
  });
  it("reuses full schema decoding locally for cards and events and releases it between calls", async () => {
    const { accounts } = setup(); const original = entry(accounts); const decode = vi.spyOn(accountDomain, "decodeAccountsDocument");
    await compareBackupAccountRecords([original], [original]); expect(decode).toHaveBeenCalledTimes(1);
    await compareBackupAccountRecords([original], [original]); expect(decode).toHaveBeenCalledTimes(2);
  });
  it("honours cancellation before and during event comparison", async () => {
    const { accounts } = setup(); const cancelled = new AbortController(); cancelled.abort();
    await expect(compareBackupAccountRecords([entry(accounts)], [], cancelled.signal)).rejects.toMatchObject({ name: "AbortError" });
    accounts.history = Array.from({ length: 300 }, (_, index) => audit(`audit-${index}`)); const controller = new AbortController(); setTimeout(() => controller.abort(), 0);
    await expect(compareBackupAccountRecords([entry(accounts)], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
