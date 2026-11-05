import { describe, expect, it } from "vitest";
import type { BackupValue } from "./localBackup";
import { getBackupDifferenceKey, getBackupDifferenceKeyLabel, type BackupDifference } from "./backupComparison";

const row = (key: BackupValue, database = "db", store = "files"): BackupDifference => ({ kind: "different", area: "Same label", id: '["number",1]', reference: { storage: "indexedDB", database, store, key } });
describe("typed archive difference addresses", () => {
  it("distinguishes numeric and string keys even when their displayed IDs coincide", () => {
    const number = row({ type: "number", value: 1 }); const string = row({ type: "string", value: number.id });
    expect(number.id).toBe(string.id); expect(getBackupDifferenceKey(number)).not.toBe(getBackupDifferenceKey(string));
    expect(getBackupDifferenceKeyLabel(number)).toBe("Ключ: число"); expect(getBackupDifferenceKeyLabel(string)).toBe("Ключ: строка");
  });
  it("separates the exact database and store without parsing their display labels", () => {
    const key: BackupValue = { type: "string", value: "a:b/c" };
    const rows = [row(key, "db/one", "files"), row(key, "db", "one/files"), row(key, "db", "files")];
    expect(new Set(rows.map(getBackupDifferenceKey)).size).toBe(3);
    expect(getBackupDifferenceKey({ ...rows[0], area: "Translated", id: "Another display label" })).toBe(getBackupDifferenceKey(rows[0]));
  });
  it("preserves composite-key order and types, including dates", () => {
    const number: BackupValue = { type: "number", value: 1 }; const string: BackupValue = { type: "string", value: "1" };
    const first = row({ type: "array", value: [number, string] }); const swapped = row({ type: "array", value: [string, number] });
    expect(getBackupDifferenceKey(first)).not.toBe(getBackupDifferenceKey(swapped));
    expect(getBackupDifferenceKey(first)).toBe(getBackupDifferenceKey(structuredClone(first)));
    expect(getBackupDifferenceKeyLabel(first)).toBe("Ключ: составной");
    const date = row({ type: "date", value: "2026-11-05T00:00:00.000Z" });
    expect(getBackupDifferenceKey(date)).not.toBe(getBackupDifferenceKey(row({ type: "string", value: "2026-11-05T00:00:00.000Z" })));
    expect(getBackupDifferenceKeyLabel(date)).toBe("Ключ: дата");
  });
  it("distinguishes database schema, store schema, local keys and file records", () => {
    const base = row({ type: "string", value: "same" });
    const rows: BackupDifference[] = [base,
      { ...base, reference: { storage: "localStorage", key: "same" } },
      { ...base, kind: "schema", reference: { storage: "schema", database: "db" } },
      { ...base, kind: "schema", reference: { storage: "schema", database: "db", store: "files" } },
    ];
    expect(new Set(rows.map(getBackupDifferenceKey)).size).toBe(4);
  });
  it("retains legacy display-only reports without inventing a writable address", () => {
    const first: BackupDifference = { kind: "new", area: "a:b", id: "c" }; const second = { ...first, area: "a", id: "b:c" };
    expect(getBackupDifferenceKey(first)).not.toBe(getBackupDifferenceKey(second));
    expect(getBackupDifferenceKey(first)).toBe(getBackupDifferenceKey({ ...first }));
    expect(getBackupDifferenceKeyLabel(first)).toBe(""); expect(first).not.toHaveProperty("reference");
  });
  it("treats quotes and prototype-like IDs as data without modifying the report", () => {
    const source = row({ type: "string", value: '__proto__"] [id="other' }); const before = JSON.stringify(source);
    expect(JSON.parse(getBackupDifferenceKey(source))).toHaveLength(5); expect(JSON.stringify(source)).toBe(before);
  });
});
