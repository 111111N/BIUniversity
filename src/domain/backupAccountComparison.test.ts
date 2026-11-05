import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteAccountComparison, compareBackupAccountRecords } from "./backupAccountComparison";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import type { AccountsDocument } from "./accounts";

const KEY = "bi-university-accounts-v1";
const entry = (document: AccountsDocument) => ({ key: KEY, raw: JSON.stringify(document) });
const number = (sequence = 1) => ({ number: `20263${String(sequence).padStart(4, "0")}`, year: 2026, campus: 3, sequence, issuedAt: "2026-11-02T09:00:00.000Z" });
const forbidden = vi.fn(() => { throw new Error("No live access or account writes during comparison"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden, removeItem: forbidden }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("read-only account card comparison", () => {
  it("compares exact IDs independently of array/property order without reading live accounts", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    accounts.accounts.reverse(); accounts.accounts = accounts.accounts.map((row) => Object.fromEntries(Object.entries(row).reverse()) as typeof row);
    const current = entry(accounts); const before = JSON.stringify([original, current]);
    const review = await compareBackupAccountRecords([original], [current]);
    expect(review.counts).toEqual({ documents: 1, comparedDocuments: 1, uncheckedDocuments: 0, same: 3, new: 0, different: 0, currentOnly: 0 });
    expect(review.differences).toEqual([]); expect(() => assertCompleteAccountComparison(review)).not.toThrow();
    expect(JSON.stringify([original, current])).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("reports personal, academic and record-number fields by name without exporting values", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    Object.assign(accounts.accounts[2], { name: "PRIVATE NAME", login: "private.student", status: "blocked", email: "private@example.invalid", scheduleName: "PRIVATE SCHEDULE", memberships: [{ subjectId: "PRIVATE SUBJECT", groupIds: ["PRIVATE GROUP"] }], studentGroupId: "PRIVATE GROUP", enrollmentStatus: "graduated", studentRecord: number(12), revision: 2, createdAt: "2026-01-01T00:00Z", updatedAt: "2026-11-02T00:00Z" });
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts).toMatchObject({ same: 2, different: 1 });
    expect(review.differences[0]).toMatchObject({ id: "student-1", fields: ["name", "login", "status", "email", "scheduleName", "memberships", "studentGroupId", "enrollmentStatus", "studentRecord", "revision", "createdAt", "updatedAt"], reference: { storage: "localStorage-record", key: KEY, collection: "accounts", id: "student-1" } });
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("private.student");
    expect(JSON.stringify(review)).not.toContain("private@example.invalid"); expect(JSON.stringify(review)).not.toContain(number(12).number);
  });
  it("recognizes role changes by ID without changing access or generating a student record", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts); accounts.accounts[1].role = "student";
    const current = entry(accounts); const review = await compareBackupAccountRecords([original], [current]);
    expect(review.differences[0].fields).toEqual(["role"]); expect(review.differences[0].id).toBe("teacher-1");
    expect(accounts.accounts[1].studentRecord).toBeUndefined(); expect(entry(accounts)).toEqual(current); expect(forbidden).not.toHaveBeenCalled();
  });
  it("does not match by name or login and does not recreate an account absent from one source", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts); accounts.accounts[2].id = "new-student-id";
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts).toMatchObject({ same: 2, new: 1, currentOnly: 1, different: 0 });
    expect(review.differences.map(({ kind, id }) => ({ kind, id }))).toEqual([{ kind: "current-only", id: "new-student-id" }, { kind: "new", id: "student-1" }]);
  });
  it("preserves legacy omission and stored spelling instead of normalizing to effective defaults", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    Object.assign(accounts.accounts[2], { name: ` ${accounts.accounts[2].name} `, login: accounts.accounts[2].login.toUpperCase(), status: "active", enrollmentStatus: "studying" });
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.differences[0].fields).toEqual(["name", "login", "status", "enrollmentStatus"]);
  });
  it("compares nested record values and assignments without moving counters or masking unknown fields", async () => {
    const { accounts } = coreBackupFixture(); accounts.accounts[2].studentRecord = number(); accounts.studentNumberCounters = { "2026:3": 10 };
    const original = entry(accounts); accounts.accounts[2].studentRecord = number(2);
    Object.assign(accounts.accounts[2], { PRIVATE_EXTENSION: { value: "PRIVATE" } }); const current = entry(accounts);
    const review = await compareBackupAccountRecords([original], [current]);
    expect(review.differences[0].fields).toEqual(["studentRecord", "other"]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
    expect(accounts.studentNumberCounters).toEqual({ "2026:3": 10 }); expect(entry(accounts)).toEqual(current);
  });
  it("leaves history, counters and document-level changes to whole-document comparison", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    accounts.revision++; accounts.studentNumberCounters = { "2026:3": 20 };
    accounts.history.push({ id: "audit-1", actorId: "configurator-demo", accountId: "student-1", occurredAt: "2026-11-02T00:00Z", action: "details-changed", previousRole: "student", nextRole: "student", changes: [{ field: "name", before: "PRIVATE BEFORE", after: "PRIVATE AFTER" }] });
    const current = entry(accounts); const review = await compareBackupAccountRecords([original], [current]);
    expect(review.counts.same).toBe(3); expect(review.differences).toEqual([]); expect(current.raw).not.toBe(original.raw);
  });
  it.each(["duplicate-id", "duplicate-login", "duplicate-number"])("does not salvage part of an ambiguous account document: %s", async (reason) => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    if (reason === "duplicate-id") accounts.accounts.push({ ...accounts.accounts[1], login: "second.teacher" });
    if (reason === "duplicate-login") accounts.accounts.push({ ...accounts.accounts[1], id: "second-teacher" });
    if (reason === "duplicate-number") { accounts.accounts[2].studentRecord = number(); accounts.accounts.push({ ...accounts.accounts[2], id: "second-student", login: "second.student" }); }
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts).toMatchObject({ comparedDocuments: 0, uncheckedDocuments: 1, new: 0, currentOnly: 0 });
    expect(review.differences).toEqual([]); expect(review.uncompared).toEqual([{ key: KEY, source: "browser", reason: "invalid-document" }]);
  });
  it.each(["no-active-configurator", "invalid-history", "empty-accounts", "invalid-number", "invalid-membership"])("requires the complete existing account schema: %s", async (reason) => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    if (reason === "no-active-configurator") accounts.accounts[0].status = "blocked";
    if (reason === "invalid-history") Object.assign(accounts, { history: [{ id: "PRIVATE" }] });
    if (reason === "empty-accounts") accounts.accounts = [];
    if (reason === "invalid-number") Object.assign(accounts.accounts[2], { studentRecord: { ...number(), number: "PRIVATE BAD NUMBER" } });
    if (reason === "invalid-membership") accounts.accounts[2].memberships.push({ subjectId: "other", groupIds: ["another-group"] });
    const review = await compareBackupAccountRecords([original], [entry(accounts)]);
    expect(review.counts.uncheckedDocuments).toBe(1); expect(review.differences).toEqual([]); expect(JSON.stringify(review)).not.toContain("PRIVATE");
  });
  it("distinguishes missing sources, future aliases, malformed JSON and duplicate keys", async () => {
    const { accounts } = coreBackupFixture(); const original = entry(accounts);
    expect((await compareBackupAccountRecords([], [])).counts.documents).toBe(0);
    expect((await compareBackupAccountRecords([original], [])).counts.new).toBe(3);
    const future = await compareBackupAccountRecords([{ ...original, key: "bi-university-accounts-v2" }], [original]);
    expect(future.counts).toMatchObject({ same: 0, currentOnly: 3, uncheckedDocuments: 1 });
    expect(future.uncompared[0].reason).toBe("unsupported-key");
    expect((await compareBackupAccountRecords([original, original], [])).uncompared[0].reason).toBe("duplicate-key");
    expect((await compareBackupAccountRecords([{ ...original, raw: "PRIVATE{broken" }], [])).uncompared[0].reason).toBe("invalid-document");
  });
  it("retains a complete long account list and rejects truncated or wrongly addressed reports", async () => {
    const { accounts } = coreBackupFixture(); const student = accounts.accounts[2];
    accounts.accounts = [accounts.accounts[0], ...Array.from({ length: 230 }, (_, index) => ({ ...student, id: `student-${String(index).padStart(3, "0")}`, name: `PRIVATE ${index}`, login: `private.student.${index}` }))];
    const review = await compareBackupAccountRecords([entry(accounts)], []);
    expect(review.counts.new).toBe(231); expect(review.differences.at(-1)?.id).toBe("student-229"); expect(() => assertCompleteAccountComparison(review)).not.toThrow();
    const wrong = structuredClone(review); Object.assign(wrong.differences[0].reference!, { collection: "subjects" });
    expect(() => assertCompleteAccountComparison(wrong)).toThrow("неполный отчёт");
    review.differences.pop(); expect(() => assertCompleteAccountComparison(review)).toThrow("неполный отчёт");
  });
  it("cancels before reading and during long comparisons without touching accounts", async () => {
    const { accounts } = coreBackupFixture(); const controller = new AbortController(); controller.abort();
    await expect(compareBackupAccountRecords([entry(accounts)], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    const student = accounts.accounts[2]; accounts.accounts = [accounts.accounts[0], ...Array.from({ length: 300 }, (_, index) => ({ ...student, id: `student-${index}`, login: `student.${index}` }))];
    const pending = new AbortController(); setTimeout(() => pending.abort(), 0);
    await expect(compareBackupAccountRecords([entry(accounts)], [], pending.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(forbidden).not.toHaveBeenCalled();
  });
});
