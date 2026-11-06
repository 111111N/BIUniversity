import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareBackupFileDifference, assertBackupFileDifferenceDetails, type BackupFileDifferenceDetails } from "./backupFileDifference";
import { createBackupBudget, encodeBackupValue } from "./localBackup";
import type { BackupDifference } from "./backupComparison";

type FileSource = Parameters<typeof compareBackupFileDifference>[0];
const content = "PRIVATE CONTENT A";
const blob = (text = content, name = "PRIVATE NAME.txt", type = "text/plain", modified = 42) => new File([text], name, { type, lastModified: modified });
const source = async (kind: "material" | "message" | "learning" = "material", changes: Record<string, unknown> = {}): Promise<FileSource> => {
  const file = changes.blob instanceof Blob ? changes.blob : blob();
  const raw = kind === "learning" ? file : { id: "file-1", name: "PRIVATE NAME.txt", type: file.type, size: file.size, scope: kind === "material" ? "user:teacher-1" : "teacher:teacher-1:student-1", blob: file, ...(kind === "material" ? { createdAt: 42 } : {}), ...changes };
  return { database: kind === "material" ? "bi-university-cabinet" : kind === "message" ? "bi-university-message-files" : "bi-university-learning-files", version: kind === "material" ? 2 : 1,
    store: { name: kind === "material" ? "teacher-files" : kind === "message" ? "attachments" : "files", keyPath: kind === "learning" ? null : "id", autoIncrement: false, indexes: kind === "material" ? [{ name: "scope", keyPath: "scope", unique: false, multiEntry: false }] : [] },
    key: { type: "string", value: "file-1" }, value: await encodeBackupValue(raw, createBackupBudget()),
  };
};
const row = (detail: BackupFileDifferenceDetails): BackupDifference => ({ kind: "different", area: "Материалы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-cabinet", store: "teacher-files", key: { type: "string", value: "file-1" } }, fileDifference: detail });
const forbidden = vi.fn(() => { throw new Error("No file opening, live stores or writes during classification"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => vi.unstubAllGlobals());

describe("safe file-difference metadata", () => {
  it.each(["material", "message", "learning"] as const)("does not invent differences for matching %s records", async kind => {
    const input = await source(kind), before = JSON.stringify(input);
    expect(await compareBackupFileDifference(input, structuredClone(input))).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });
  it("classifies metadata fields without disclosing their names, values or binary data", async () => {
    const a = await source(), b = await source("material", { description: "PRIVATE DESCRIPTION", scope: "user:teacher-2", pinned: true });
    const detail = await compareBackupFileDifference(a, b);
    expect(detail).toEqual({ version: 1, status: "compared", fields: ["scope", "description", "pinned"], issues: [], ownership: "unverified" });
    expect(JSON.stringify(detail)).not.toMatch(/PRIVATE|teacher-1|teacher-2|base64/); expect(() => assertBackupFileDifferenceDetails(row(detail!))).not.toThrow();
  });
  it.each(["material", "message", "learning"] as const)("distinguishes changed content with identical metadata in %s", async kind => {
    const a = await source(kind), b = await source(kind, { blob: blob("PRIVATE CONTENT B") });
    const detail = await compareBackupFileDifference(a, b);
    expect(detail).toMatchObject({ status: "compared", fields: ["content"], ownership: "unverified" }); expect(JSON.stringify(detail)).not.toContain("PRIVATE");
  });
  it("distinguishes Blob/File metadata from content", async () => {
    const a = await source("learning"), b = await source("learning", { blob: new Blob([content], { type: "text/plain" }) });
    expect(await compareBackupFileDifference(a, b)).toMatchObject({ fields: ["fileName", "lastModified"] });
  });
  it("classifies coherent file name, MIME type, size and modification changes", async () => {
    const a = await source(), changed = blob(`${content}X`, "PRIVATE NEW.txt", "application/octet-stream", 43);
    const b = await source("material", { blob: changed, name: changed.name, type: changed.type, size: changed.size });
    expect(await compareBackupFileDifference(a, b)).toMatchObject({ fields: ["name", "type", "size", "fileName", "lastModified", "content"] });
  });
  it("preserves the difference between an absent optional field and saved undefined", async () => {
    const a = await source(), b = await source("material", { description: undefined });
    expect(await compareBackupFileDifference(a, b)).toMatchObject({ fields: ["description"] });
  });
  it("marks unknown fields as partial without inspecting or disclosing their contents", async () => {
    const a = await source(), b = await source("material", { "PRIVATE EXTRA": new Blob(["PRIVATE UNKNOWN BYTES"]), description: "PRIVATE DESCRIPTION" });
    const detail = await compareBackupFileDifference(a, b);
    expect(detail).toMatchObject({ status: "partial", fields: ["description"], issues: [{ source: "browser", reason: "unknown-fields" }] });
    expect(JSON.stringify(detail)).not.toMatch(/PRIVATE|base64/); expect(() => assertBackupFileDifferenceDetails(row(detail!))).not.toThrow();
    const onlyUnknown = await compareBackupFileDifference(a, await source("material", { "PRIVATE EXTRA": "PRIVATE VALUE" }));
    expect(onlyUnknown).toMatchObject({ status: "partial", fields: [] }); expect(() => assertBackupFileDifferenceDetails(row(onlyUnknown!))).not.toThrow();
  });
  it.each(["size", "name", "type", "id", "date"])("does not classify inconsistent metadata as valid: %s", async field => {
    const changes = field === "size" ? { size: 999 } : field === "name" ? { name: "PRIVATE WRONG" } : field === "type" ? { type: "PRIVATE WRONG" } : field === "id" ? { id: "other-file" } : { createdAt: 9e99 };
    const detail = await compareBackupFileDifference(await source(), await source("material", changes));
    expect(detail).toMatchObject({ status: "uncompared", fields: [], issues: [{ source: "browser", reason: "invalid-record" }] }); expect(JSON.stringify(detail)).not.toContain("PRIVATE");
  });
  it.each(["version", "index", "keyPath", "autoIncrement"])("leaves an unsupported store unexamined: %s", async field => {
    const a = await source(), b = await source();
    if (field === "version") b.version = 99;
    if (field === "index") b.store.indexes.push({ name: "PRIVATE INDEX", keyPath: "name", unique: true, multiEntry: false });
    if (field === "keyPath") b.store.keyPath = "name";
    if (field === "autoIncrement") b.store.autoIncrement = true;
    const detail = await compareBackupFileDifference(a, b);
    expect(detail).toMatchObject({ status: "uncompared", fields: [], issues: [{ source: "browser", reason: "unsupported-store" }] }); expect(JSON.stringify(detail)).not.toContain("PRIVATE");
  });
  it("does not misidentify a different store, typed key, or mismatched ID as the same file", async () => {
    const a = await source(), b = await source(); b.store.name = "unknown"; expect(await compareBackupFileDifference(a, b)).toBeUndefined();
    b.store.name = a.store.name; b.key = { type: "number", value: 1 };
    expect(await compareBackupFileDifference(a, b)).toMatchObject({ status: "uncompared", issues: [{ source: "browser", reason: "invalid-record" }] });
  });
  it("honours cancellation during chunked binary comparison without opening a file", async () => {
    const a = await source(), b = await source("material", { description: "PRIVATE CHANGE" }), controller = new AbortController();
    const pending = compareBackupFileDifference(a, b, controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(forbidden).not.toHaveBeenCalled();
  });
  it.each(["unknown-field", "extra-value", "nested-extra-value", "false-ownership", "duplicate-field", "incomplete-status", "sparse-fields", "sparse-issues", "wrong-address"])("refuses incomplete or leaking report annotations: %s", async mode => {
    const detail = (await compareBackupFileDifference(await source(), await source("material", { description: "PRIVATE CHANGE" })))!;
    const difference = row(detail);
    if (mode === "unknown-field") Object.assign(detail, { fields: ["PRIVATE VALUE"] });
    if (mode === "extra-value") Object.assign(detail, { description: "PRIVATE VALUE" });
    if (mode === "nested-extra-value") { detail.status = "partial"; detail.issues = [{ source: "archive", reason: "unknown-fields" }]; Object.assign(detail.issues[0], { payload: "PRIVATE VALUE" }); }
    if (mode === "false-ownership") Object.assign(detail, { ownership: "confirmed" });
    if (mode === "duplicate-field") detail.fields.push(detail.fields[0]);
    if (mode === "incomplete-status") detail.fields = [];
    if (mode === "sparse-fields") detail.fields = new Array(1);
    if (mode === "sparse-issues") { detail.status = "partial"; detail.issues = new Array(1); }
    if (mode === "wrong-address") difference.reference = { storage: "localStorage", key: "file-1" };
    expect(() => assertBackupFileDifferenceDetails(difference)).toThrow("неполный отчёт");
  });
});
