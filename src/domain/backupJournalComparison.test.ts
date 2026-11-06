import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCompleteJournalComparison, compareBackupJournalRecords } from "./backupJournalComparison";
import { journalBackupFixture, coreBackupFixture } from "../testSupport/localBackupDocuments";
import type { BackupRecordEntries } from "./backupRecordComparison";

const PREFIX = "bi-university-journal-history-v1:";
const forbidden = vi.fn(() => { throw new Error("Journal comparison must not use live storage"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const scopes = (subjectIds: string[], groupIds: string[], key: string, raw: string): BackupRecordEntries => {
  const state = coreBackupFixture(); state.subjects.subjects = subjectIds.map((id, i) => ({ ...state.subjects.subjects[0], id, name: `Дисциплина ${i}`, shortName: `Д${i}` }));
  state.groups.groups = groupIds.map((id, i) => ({ ...state.groups.groups[0], id, name: `${101 + i}-ИВТ` })); state.save();
  return [...state.archive.localStorage.filter(entry => entry.key.includes("-catalog-")), { key, raw }];
};

describe("journal audit comparison with confirmed source areas", () => {
  it("compares exact saved event IDs and leaves all source data intact", async () => {
    const state = journalBackupFixture(); const before = JSON.stringify(state.archive); const result = await compareBackupJournalRecords(state.archive.localStorage, state.archive.localStorage);
    expect(result.counts).toMatchObject({ same: 1, different: 0, comparedDocuments: 1 }); expect(result.differences).toEqual([]);
    expect(() => assertCompleteJournalComparison(result)).not.toThrow(); expect(JSON.stringify(state.archive)).toBe(before); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("compares changed fields without exporting names, actor details or grades", async () => {
    const state = journalBackupFixture(); const original = structuredClone(state.archive.localStorage);
    Object.assign(state.changes[0], { changedAt: "2026-10-29T12:00:00Z", studentId: "another-student", studentName: "PRIVATE NAME", lessonId: "another-lesson", field: "grade", previousValue: 4, nextValue: 5, actor: { id: "another-actor", name: "PRIVATE AUTHOR" } }); state.save();
    const result = await compareBackupJournalRecords(original, state.archive.localStorage);
    expect(result.differences[0]).toMatchObject({ id: "change-1", fields: ["changedAt", "actor", "studentId", "studentName", "lessonId", "field", "previousValue", "nextValue"], reference: { storage: "localStorage-record", collection: "journal-history", key: state.historyKey, id: "change-1" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(result)).not.toContain("2026-10-29");
  });
  it("keeps equal event IDs in separate literal teaching-area keys", async () => {
    const state = journalBackupFixture(); state.groups.groups.push({ ...state.groups.groups[0], id: "group-2", name: "102-ИВТ" }); state.save();
    state.archive.localStorage.push({ key: PREFIX + "subject-1:group-2", raw: JSON.stringify(state.changes) });
    const result = await compareBackupJournalRecords(state.archive.localStorage, []);
    expect(result.counts).toMatchObject({ new: 2, comparedDocuments: 2 }); expect(new Set(result.differences.map(row => row.reference && "key" in row.reference ? row.reference.key : "")).size).toBe(2);
  });
  it("does not guess a split for an ambiguous colon-delimited key", async () => {
    const state = journalBackupFixture(); const source = scopes(["a", "a:b"], ["c", "b:c"], PREFIX + "a:b:c", JSON.stringify(state.changes));
    const result = await compareBackupJournalRecords(source, []);
    expect(result.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0, new: 0 }); expect(result.uncompared[0].reason).toBe("unresolved-journal-area");
  });
  it("does not merge one key whose resolved scope changed between archive and browser", async () => {
    const state = journalBackupFixture(); const raw = JSON.stringify(state.changes), key = PREFIX + "a:b:c";
    const archive = scopes(["a:b"], ["c"], key, raw), browser = scopes(["a"], ["b:c"], key, raw);
    const result = await compareBackupJournalRecords(archive, browser);
    expect(result.counts).toMatchObject({ same: 0, uncheckedDocuments: 1, comparedDocuments: 0 }); expect(result.uncompared).toHaveLength(2); expect(result.differences).toEqual([]);
  });
  it.each(["missing", "broken", "duplicate"])("requires each source's own catalogs: %s", async mode => {
    const state = journalBackupFixture(); const archive = structuredClone(state.archive.localStorage); const key = "bi-university-group-catalog-v1";
    let browser = structuredClone(archive);
    if (mode === "missing") browser = browser.filter(entry => entry.key !== key);
    if (mode === "broken") browser.find(entry => entry.key === key)!.raw = "PRIVATE{broken";
    if (mode === "duplicate") browser.push({ ...browser.find(entry => entry.key === key)! });
    const result = await compareBackupJournalRecords(archive, browser);
    expect(result.counts).toMatchObject({ same: 0, uncheckedDocuments: 1 }); expect(result.differences).toEqual([]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it.each(["duplicate-id", "invalid-value", "bad-date"])("rejects the whole event list without partial salvage: %s", async mode => {
    const state = journalBackupFixture(); const original = structuredClone(state.archive.localStorage);
    if (mode === "duplicate-id") state.changes.push({ ...state.changes[0] });
    if (mode === "invalid-value") Object.assign(state.changes[0], { field: "grade", nextValue: 6 });
    if (mode === "bad-date") state.changes[0].changedAt = "PRIVATE INVALID";
    state.save(); const result = await compareBackupJournalRecords(original, state.archive.localStorage);
    expect(result.counts).toMatchObject({ uncheckedDocuments: 1, new: 0, currentOnly: 0 }); expect(result.uncompared[0].reason).toBe("invalid-document"); expect(result.differences).toEqual([]);
  });
  it("preserves unknown fields and legacy missing-lesson warnings without exposing values", async () => {
    const state = journalBackupFixture(); delete state.changes[0].lessonId; state.save(); const original = structuredClone(state.archive.localStorage);
    Object.assign(state.changes[0], { "PRIVATE FIELD": "PRIVATE VALUE" }); state.save();
    const result = await compareBackupJournalRecords(original, state.archive.localStorage);
    expect(result.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("does not match replacement IDs by identical timestamps and values", async () => {
    const state = journalBackupFixture(); const original = structuredClone(state.archive.localStorage); state.changes[0].id = "another-event"; state.save();
    const result = await compareBackupJournalRecords(original, state.archive.localStorage);
    expect(result.counts).toMatchObject({ same: 0, different: 0, new: 1, currentOnly: 1 });
  });
  it("distinguishes explicit empty lists and unsupported future keys", async () => {
    const state = journalBackupFixture(); state.changes.length = 0; state.save();
    expect((await compareBackupJournalRecords(state.archive.localStorage, [])).counts).toMatchObject({ comparedDocuments: 1, new: 0 });
    const future = state.archive.localStorage.map(entry => entry.key === state.historyKey ? { ...entry, key: entry.key.replace("-v1:", "-v2:") } : entry);
    expect((await compareBackupJournalRecords(future, [])).uncompared[0].reason).toBe("unsupported-key");
  });
  it("retains all events beyond a UI page and rejects incomplete exports", async () => {
    const state = journalBackupFixture(); state.changes.splice(0, 1, ...Array.from({ length: 230 }, (_, i) => ({ ...state.changes[0], id: `change-${String(i).padStart(3, "0")}` }))); state.save();
    const result = await compareBackupJournalRecords(state.archive.localStorage, []);
    expect(result.differences).toHaveLength(230); expect(result.differences.at(-1)?.id).toBe("change-229"); expect(() => assertCompleteJournalComparison(result)).not.toThrow();
    const wrong = structuredClone(result); Object.assign(wrong.differences[0].reference!, { collection: "account-history" }); expect(() => assertCompleteJournalComparison(wrong)).toThrow("неполный отчёт");
    result.differences.pop(); expect(() => assertCompleteJournalComparison(result)).toThrow("неполный отчёт");
  });
  it("honours cancellation while resolving or comparing many keys", async () => {
    const state = journalBackupFixture(); const controller = new AbortController(); controller.abort();
    await expect(compareBackupJournalRecords(state.archive.localStorage, [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    state.changes.splice(0, 1, ...Array.from({ length: 300 }, (_, i) => ({ ...state.changes[0], id: `change-${i}` }))); state.save();
    const pending = new AbortController(); setTimeout(() => pending.abort(), 0);
    await expect(compareBackupJournalRecords(state.archive.localStorage, [], pending.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
