import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareBackupNotificationRecords, assertCompleteNotificationComparison } from "./backupNotificationComparison";
import { readBackupRecordPreview } from "./backupRecordPreview";
import { notificationBackupFixture } from "../testSupport/localBackupDocuments";
import type { BackupRecordEntries } from "./backupRecordComparison";
import { BACKUP_LIMITS } from "./localBackup";

const key = "bi-university-demo-notifications", accountKey = "bi-university-accounts-v1";
const changeDocument = (entries: BackupRecordEntries, update: (rows: Record<string, unknown>[]) => unknown) => entries.map(entry => entry.key !== key ? { ...entry } : { key, raw: JSON.stringify(update(JSON.parse(entry.raw).items)) });
const forbidden = vi.fn(() => { throw new Error("Comparison cannot read live stores, deliver notices or open links"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("window", { open: forbidden, dispatchEvent: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("notification records in administrative archives", () => {
  it("compares unchanged records using their exact key and ID without accessing live data", async () => {
    const fixture = notificationBackupFixture(), before = JSON.stringify(fixture.archive);
    const result = await compareBackupNotificationRecords(fixture.archive.localStorage, fixture.archive.localStorage);
    expect(result.counts).toEqual({ documents: 1, comparedDocuments: 1, uncheckedDocuments: 0, same: 1, new: 0, different: 0, currentOnly: 0 });
    expect(() => assertCompleteNotificationComparison(result)).not.toThrow(); expect(JSON.stringify(fixture.archive)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("reports changed fields and recipient IDs as field names without exposing saved values", async () => {
    const fixture = notificationBackupFixture(), archive = structuredClone(fixture.archive.localStorage);
    fixture.notifications[0].recipientUserId = "teacher-1"; fixture.notifications[0].body = "PRIVATE NEW BODY"; fixture.notifications[0].read = true; fixture.save();
    const result = await compareBackupNotificationRecords(archive, fixture.archive.localStorage);
    expect(result.differences).toEqual([{ kind: "different", area: expect.any(String), id: "notice-1", reference: { storage: "localStorage-record", key, collection: "notifications", id: "notice-1" }, fields: ["recipientUserId", "body", "read"] }]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|student-1|teacher-1|schedule\?date/); expect(() => assertCompleteNotificationComparison(result)).not.toThrow();
    const preview = await readBackupRecordPreview(archive, fixture.archive.localStorage, result.differences[0]);
    expect(preview.rows[0]).toMatchObject({ field: "recipientUserId", label: "ID получателя", archive: '"student-1"', browser: '"teacher-1"' });
    expect(preview.rows[1]).toMatchObject({ field: "body", label: "Текст уведомления", browser: '"PRIVATE NEW BODY"' }); expect(forbidden).not.toHaveBeenCalled();
  });
  it("keeps archive-only and browser-only notifications distinct without selecting or deleting versions", async () => {
    const fixture = notificationBackupFixture(), archive = structuredClone(fixture.archive.localStorage);
    fixture.notifications[0].id = "browser-notice"; fixture.save();
    const result = await compareBackupNotificationRecords(archive, fixture.archive.localStorage);
    expect(result.counts).toMatchObject({ new: 1, currentOnly: 1, different: 0 });
    expect(result.differences.map(row => [row.kind, row.id])).toEqual([["current-only", "browser-notice"], ["new", "notice-1"]]);
  });
  it("marks unknown extra fields without revealing their names or values or permitting a complete choice", async () => {
    const fixture = notificationBackupFixture(), archive = structuredClone(fixture.archive.localStorage);
    const browser = changeDocument(archive, rows => ({ version: 2, items: rows.map(row => ({ ...row, "PRIVATE FIELD": "PRIVATE VALUE" })) }));
    const result = await compareBackupNotificationRecords(archive, browser);
    expect(result.differences[0].fields).toEqual(["other"]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(await readBackupRecordPreview(archive, browser, result.differences[0])).toMatchObject({ rows: [], hasUnpreviewedFields: true });
  });
  it.each(["array", "v1", "unversioned"])("preserves explicit legacy identities without manufacturing defaults: %s", async format => {
    const fixture = notificationBackupFixture();
    const entries = changeDocument(fixture.archive.localStorage, rows => {
      const items = rows.map(({ recipientUserId: userId, ...row }) => ({ ...row, userId }));
      return format === "array" ? items : format === "v1" ? { version: 1, items } : { items };
    });
    const before = JSON.stringify(entries), result = await compareBackupNotificationRecords(entries, entries);
    expect(result.counts).toMatchObject({ same: 1, comparedDocuments: 1, uncheckedDocuments: 0 }); expect(JSON.stringify(entries)).toBe(before);
  });
  it.each(["idless", "role-only", "conflicting-aliases"])("refuses to infer an identity or recipient from a legacy list: %s", async mode => {
    const fixture = notificationBackupFixture();
    const entries = changeDocument(fixture.archive.localStorage, rows => rows.map(row => {
      const next = { ...row };
      if (mode === "idless") delete next.id;
      if (mode === "role-only") { delete next.recipientUserId; next.recipientRole = "student"; }
      if (mode === "conflicting-aliases") next.userId = "teacher-1";
      return next;
    }));
    const result = await compareBackupNotificationRecords(entries, []);
    expect(result.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0, new: 0 }); expect(result.differences).toEqual([]);
    expect(result.uncompared).toEqual([{ key, source: "archive", reason: "unresolved-notification-source" }]); expect(() => assertCompleteNotificationComparison(result)).not.toThrow();
  });
  it.each(["archive", "browser"] as const)("cannot borrow the other source's account catalog: %s", async source => {
    const fixture = notificationBackupFixture(), inputs = { archive: structuredClone(fixture.archive.localStorage), browser: structuredClone(fixture.archive.localStorage) };
    inputs[source] = inputs[source].filter(entry => entry.key !== accountKey);
    const result = await compareBackupNotificationRecords(inputs.archive, inputs.browser);
    expect(result.uncompared).toEqual([{ key, source, reason: "unresolved-notification-source" }]); expect(result.counts).toMatchObject({ uncheckedDocuments: 1, comparedDocuments: 0, same: 0, new: 0, currentOnly: 0 });
  });
  it.each(["invalid-account", "missing-owner", "duplicate-account", "literal-recipient"])("treats unconfirmed source ownership as unavailable: %s", async mode => {
    const fixture = notificationBackupFixture(); let entries = structuredClone(fixture.archive.localStorage);
    const account = entries.find(entry => entry.key === accountKey)!;
    if (mode === "invalid-account") account.raw = "PRIVATE BROKEN JSON";
    if (mode === "missing-owner") { fixture.accounts.accounts.splice(2, 1); fixture.save(); entries = fixture.archive.localStorage; }
    if (mode === "duplicate-account") entries.push({ ...account });
    if (mode === "literal-recipient") entries = changeDocument(entries, rows => ({ version: 2, items: rows.map(row => ({ ...row, recipientUserId: " student-1 " })) }));
    const result = await compareBackupNotificationRecords(entries, []);
    expect(result.uncompared).toEqual([{ key, source: "archive", reason: "unresolved-notification-source" }]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("recognizes an explicitly empty list without manufacturing missing notifications", async () => {
    const result = await compareBackupNotificationRecords([{ key, raw: '{"version":2,"items":[]}' }], []);
    expect(result.counts).toMatchObject({ comparedDocuments: 1, uncheckedDocuments: 0, same: 0, new: 0 });
  });
  it("does not expose an arbitrary object through the known legacy recipient-role field", async () => {
    const fixture = notificationBackupFixture();
    const entries = changeDocument(fixture.archive.localStorage, rows => ({ version: 2, items: rows.map(row => ({ ...row, recipientRole: { "PRIVATE FIELD": "PRIVATE CONTENT" } })) }));
    const result = await compareBackupNotificationRecords(entries, []);
    expect(result.uncompared).toEqual([{ key, source: "archive", reason: "invalid-document" }]);
    expect(result.differences).toEqual([]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it.each(["bad-row", "duplicate-id", "bad-link", "unsupported-version"])("rejects the whole source rather than salvaging a partial list: %s", async mode => {
    const fixture = notificationBackupFixture();
    const entries = changeDocument(fixture.archive.localStorage, rows => ({ version: mode === "unsupported-version" ? 99 : 2, items: mode === "bad-row" ? [...rows, null] : mode === "duplicate-id" ? [...rows, { ...rows[0], id: " notice-1 " }] : mode === "bad-link" ? rows.map(row => ({ ...row, href: "https://PRIVATE.example" })) : rows }));
    const result = await compareBackupNotificationRecords(entries, []);
    expect(result.uncompared).toEqual([{ key, source: "archive", reason: "invalid-document" }]); expect(result.counts.new).toBe(0); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("does not merge a future key or repeated document into a supported list", async () => {
    const fixture = notificationBackupFixture(), entry = fixture.archive.localStorage.find(row => row.key === key)!;
    const result = await compareBackupNotificationRecords([...fixture.archive.localStorage, { ...entry }, { ...entry, key: `${key}-v3` }], []);
    expect(result.counts).toMatchObject({ documents: 2, comparedDocuments: 0, uncheckedDocuments: 2, new: 0 });
    expect(result.uncompared.map(row => row.reason)).toEqual(["duplicate-key", "unsupported-key"]);
  });
  it("rechecks recipients before exposing preview values", async () => {
    const fixture = notificationBackupFixture(), archive = structuredClone(fixture.archive.localStorage); fixture.notifications[0].body = "PRIVATE NEW"; fixture.save();
    const result = await compareBackupNotificationRecords(archive, fixture.archive.localStorage);
    await expect(readBackupRecordPreview(archive, fixture.archive.localStorage.filter(row => row.key !== accountKey), result.differences[0])).rejects.toThrow("не подтверждён");
  });
  it("does not return partial results beyond the budget or after cancellation", async () => {
    await expect(compareBackupNotificationRecords([{ key, raw: "x".repeat(BACKUP_LIMITS.textBytes / 2) }], [])).rejects.toThrow("16 МиБ");
    const controller = new AbortController(); controller.abort();
    await expect(compareBackupNotificationRecords([], [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
