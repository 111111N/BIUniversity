import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedFileIndexes } from "./backupFileIndexes";
import { createBackupBudget, encodeBackupValue, type BackupStoreMetadata, type BackupValue } from "./localBackup";
import { inspectBackupDocuments } from "./localBackupDocuments";
import { inspectArchivedLearningAttachments } from "./backupLearningAttachments";
import { inspectBackupMessaging } from "./backupMessagingDocuments";
import { materialIndexBackupFixture, learningFileBackupFixture, messageFileBackupFixture } from "../testSupport/localBackupDocuments";

const forbidden = vi.fn(() => { throw new Error("Index checks must not access browser databases or decode file bytes"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden, cmp: forbidden }); vi.stubGlobal("atob", forbidden); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const index = (patch: Partial<BackupStoreMetadata["indexes"][number]> = {}) => ({ name: "by-value", keyPath: "value", unique: true, multiEntry: false, ...patch });
const records = async (values: unknown[]) => {
  const budget = createBackupBudget();
  return Promise.all(values.map(async (value, position) => ({ key: { type: "string" as const, value: `file-${position}` }, value: await encodeBackupValue(value, budget) })));
};

describe("archived file index constraints", () => {
  it("reports duplicate scalar keys with index and record IDs without values or source changes", async () => {
    const rows = await records([{ value: "PRIVATE" }, { value: "PRIVATE" }, { value: "PRIVATE" }]); const before = JSON.stringify(rows);
    const result = await inspectArchivedFileIndexes(rows, [index()]);
    expect(result.issues).toHaveLength(2); expect(result.issues[0]).toMatchObject({ level: "error", code: "file-unique-index-conflict", recordId: JSON.stringify(["index", "by-value", "file-0", "file-1"]) });
    expect(result.issues[1].recordId).toBe(JSON.stringify(["index", "by-value", "file-0", "file-2"]));
    expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0; конфликтующих записей: 2");
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(rows)).toBe(before);
  });

  it("does not coerce string, number and date keys into the same value", async () => {
    const rows = await records([{ value: "1" }, { value: 1 }, { value: new Date(1) }]);
    expect((await inspectArchivedFileIndexes(rows, [index()])).issues).toEqual([]);
  });

  it.each(["", 0, new Date("2026-10-30T00:00:00Z")])("matches equal supported keys including empty strings and dates: %s", async (value) => {
    expect((await inspectArchivedFileIndexes(await records([{ value }, { value }]), [index()])).issues).toHaveLength(1);
  });

  it("compares negative zero with zero and does not trim or normalize strings", async () => {
    expect((await inspectArchivedFileIndexes(await records([{ value: -0 }, { value: 0 }]), [index()])).issues).toHaveLength(1);
    expect((await inspectArchivedFileIndexes(await records([{ value: "A" }, { value: "a" }, { value: " a " }]), [index()])).issues).toEqual([]);
  });

  it.each([undefined, null, true, {}, { nested: "PRIVATE" }])("does not require an index entry for non-key values: %j", async (value) => {
    const rows = await records([{ value }, { value }, {}]); const result = await inspectArchivedFileIndexes(rows, [index()]);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0");
  });

  it("reads nested own paths without inheriting object properties", async () => {
    const rows = await records([{ metadata: { category: "PRIVATE" } }, { metadata: { category: "PRIVATE" } }, {}]);
    expect((await inspectArchivedFileIndexes(rows, [index({ keyPath: "metadata.category" })])).issues).toHaveLength(1);
    const prototype = await inspectArchivedFileIndexes(rows, [index({ keyPath: "constructor.name" }), index({ name: "prototype", keyPath: "__proto__.constructor.name" })]);
    expect(prototype.issues).toEqual([]);
  });

  it("reads Blob and File properties from tagged metadata without confusing a tag with the stored MIME type", async () => {
    const rows = await records([new File(["PRIVATE"], "one", { type: "text/plain", lastModified: 1 }), new File(["PRIVATE"], "two", { type: "text/csv", lastModified: 2 })]);
    expect((await inspectArchivedFileIndexes(rows, [index({ keyPath: "size" })])).issues).toHaveLength(1);
    for (const keyPath of ["name", "type", "lastModified"]) expect((await inspectArchivedFileIndexes(rows, [index({ keyPath })])).issues).toEqual([]);
    const blobs = await records([new Blob(["one"]), new Blob(["two"])]);
    expect((await inspectArchivedFileIndexes(blobs, [index({ keyPath: "name" })])).issues).toEqual([]);
  });

  it("supports string and array length metadata and the empty key path", async () => {
    expect((await inspectArchivedFileIndexes(await records(["one", "two"]), [index({ keyPath: "length" })])).issues).toHaveLength(1);
    expect((await inspectArchivedFileIndexes(await records([[1], [2]]), [index({ keyPath: "length" })])).issues).toHaveLength(1);
    expect((await inspectArchivedFileIndexes(await records(["PRIVATE", "PRIVATE"]), [index({ keyPath: "" })])).issues).toHaveLength(1);
  });

  it.each([{ keyPath: "value[0]" }, { keyPath: "value." }, { keyPath: ".value" }, { keyPath: "value..nested" }, { keyPath: "0value" }, { keyPath: "🙂" }, { keyPath: "value\n" }, { keyPath: "value\r" }, { keyPath: "value\u2028" }, { keyPath: "value\u2029" }])("keeps unsupported index constraints unconfirmed: %j", async (patch) => {
    const result = await inspectArchivedFileIndexes(await records([{ value: "PRIVATE" }, { value: "PRIVATE" }]), [index(patch)]);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("сверены текущие ключи: 0; требуют отдельной сверки: 1");
  });

  it.each(["ключ", "Δεδομένα", "数据", "𐐀", "℘", "поле١", "e\u0301", "a\u200Cb", "a\u200Db", "a·b", "$поле", "_поле", "await"])("matches a literal Unicode identifier without exposing indexed values: %s", async (keyPath) => {
    const rows = await records([{ [keyPath]: "PRIVATE" }, { [keyPath]: "PRIVATE" }]);
    const result = await inspectArchivedFileIndexes(rows, [index({ keyPath })]);
    expect(result.issues).toHaveLength(1); expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("matches nested Unicode paths and keeps canonically equivalent field names distinct", async () => {
    const rows = await records([{ реквизиты: { код: "PRIVATE" }, "é": 1, "e\u0301": 2 }, { реквизиты: { код: "PRIVATE" }, "é": 2, "e\u0301": 1 }]);
    expect((await inspectArchivedFileIndexes(rows, [index({ keyPath: ["реквизиты.код", "é"] })])).issues).toEqual([]);
    expect((await inspectArchivedFileIndexes(rows, [index({ keyPath: "реквизиты.код" })])).issues).toHaveLength(1);
    const distinct = await records([{ "é": "PRIVATE" }, { "e\u0301": "PRIVATE" }]);
    expect((await inspectArchivedFileIndexes(distinct, [index({ keyPath: "é" })])).issues).toEqual([]);
    expect((await inspectArchivedFileIndexes(distinct, [index({ keyPath: "e\u0301" })])).issues).toEqual([]);
  });

  it("does not decode valid escape paths into different stored property names", async () => {
    const rows = await records([{ a: "PRIVATE", ключ: "PRIVATE" }, { a: "PRIVATE", ключ: "PRIVATE" }]);
    const result = await inspectArchivedFileIndexes(rows, [index({ keyPath: ["ключ", "\\u0061"] })]);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0");
  });

  it.each(["\\u0061", "\\u{61}", "\\u{00000061}", "a\\u0030", "\\u{10400}", "\\u0024", "\\u005F", "a\\u200C", "a\\u200D", "a\\u0301", "\\u0061wait", "ключ\\u{391}"])("matches valid escaped identifier spelling as a literal own field: %s", async (keyPath) => {
    const rows = await records([{ [keyPath]: "PRIVATE" }, { [keyPath]: "PRIVATE" }]); const before = JSON.stringify(rows);
    const result = await inspectArchivedFileIndexes(rows, [index({ keyPath })]);
    expect(result.issues).toHaveLength(1); expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0");
    expect(JSON.stringify(rows)).toBe(before); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it.each(["\\u0030name", "\\u200Cname", "a\\u002E", "\\u{110000}", "\\u{FFFFFFFFFFFFFFFF}", "\\uD801\\uDC00", "\\u{D800}", "\\u{}", "\\u{61", "\\u006", "\\x61", "\\U0061", "\\\\u0061", "\\u0061\n", "\\u0061\r", "\\u0061\u2028", "\\u0061\u2029", "\\u0061.", ".\\u0061", "a..\\u0061", "a.\\u0030"])("keeps malformed escapes and invalid identifier positions unconfirmed: %s", async (keyPath) => {
    const rows = await records([{ [keyPath]: "PRIVATE" }, { [keyPath]: "PRIVATE" }]);
    const result = await inspectArchivedFileIndexes(rows, [index({ keyPath })]);
    expect(result.issues).toEqual([]); expect(result.summary).toContain("сверены текущие ключи: 0; требуют отдельной сверки: 1");
  });

  it("keeps different escape spellings, literal letters and canonically equivalent fields distinct", async () => {
    const rows = await records([{ a: 1, "\\u0061": 2, "\\u{61}": 3, "é": 4, "e\\u0301": 5 }, { a: 2, "\\u0061": 3, "\\u{61}": 4, "é": 5, "e\\u0301": 4 }]);
    for (const keyPath of ["a", "\\u0061", "\\u{61}", "é", "e\\u0301"]) {
      expect((await inspectArchivedFileIndexes(rows, [index({ keyPath })])).issues).toEqual([]);
    }
  });

  it("checks nested, compound and multiEntry keys with escaped path parts without using decoded aliases", async () => {
    const rows = await records([{ metadata: { "\\u0061": ["PRIVATE", "PRIVATE"], a: "first" }, scope: "same" }, { metadata: { "\\u0061": ["PRIVATE"], a: "second" }, scope: "same" }]);
    const expanded = await inspectArchivedFileIndexes(rows, [index({ keyPath: "metadata.\\u0061", multiEntry: true })]);
    expect(expanded.issues).toHaveLength(1);
    expect((await inspectArchivedFileIndexes(rows, [index({ keyPath: ["scope", "metadata.\\u0061"] })])).issues).toEqual([]);
    expect((await inspectArchivedFileIndexes(rows, [index({ keyPath: ["scope", "metadata.\\u{invalid}"] })])).summary).toContain("сверены текущие ключи: 0; требуют отдельной сверки: 1");
  });

  it("does not inherit fields or decode type-specific properties in escape spelling", async () => {
    const files = await records([new File(["PRIVATE"], "same"), new File(["PRIVATE"], "same")]);
    expect((await inspectArchivedFileIndexes(files, [index({ keyPath: "\\u006Eame" })])).issues).toEqual([]);
    expect((await inspectArchivedFileIndexes(files, [index({ keyPath: "name" })])).issues).toHaveLength(1);
    expect((await inspectArchivedFileIndexes(await records([{}, {}]), [index({ keyPath: "\\u005F_proto__.constructor.name" })])).issues).toEqual([]);
  });

  it("allows cancellation during a single very long escaped identifier", async () => {
    const controller = new AbortController();
    const pending = inspectArchivedFileIndexes([], [index({ keyPath: "\\u0061".repeat(3000) })], controller.signal);
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("checks array and scalar keys in one index without confusing an empty array with a missing key", async () => {
    const rows = await records([{ value: "PRIVATE" }, { value: [] }, { value: "PRIVATE" }]);
    const result = await inspectArchivedFileIndexes(rows, [index()]); expect(result.issues).toHaveLength(1);
    expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0");
    expect((await inspectArchivedFileIndexes(rows, [index({ unique: false })])).summary).toBe("");
  });

  it("integrates material conflicts while preserving readable records and the future compatibility review", async () => {
    const state = await materialIndexBackupFixture(); const before = JSON.stringify(state.archive);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 5, invalid: 0, errors: 1, reviews: 1 });
    expect(result.issues).toContainEqual(expect.objectContaining({ kind: "materials", code: "file-unique-index-conflict", referenceId: "bi-university-cabinet/teacher-files" }));
    expect(result.checks.find((check) => check.kind === "materials")).toMatchObject({ status: "valid", records: 2, message: expect.stringContaining("конфликтующих записей: 1") });
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before);
  });

  it("compares whole compound keys with types and nested array components", async () => {
    const rows = await records([
      { scope: "PRIVATE", value: [1, "x"] }, { scope: "PRIVATE", value: [1, "x"] },
      { scope: "PRIVATE", value: ["1", "x"] }, { scope: "other", value: [1, "x"] },
      { scope: "PRIVATE", value: ["x", 1] }, { scope: "PRIVATE" },
    ]);
    const result = await inspectArchivedFileIndexes(rows, [index({ keyPath: ["scope", "value"] })]);
    expect(result.issues).toHaveLength(1); expect(result.issues[0].recordId).toBe(JSON.stringify(["index", "by-value", "file-0", "file-1"]));
    expect(result.summary).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("does not flatten nested arrays or conflate differently grouped compound values", async () => {
    const rows = await records([{ value: [1, [2, 3]] }, { value: [[1, 2], 3] }, { value: [1, 2, 3] }, { value: [] }, { value: [] }]);
    const result = await inspectArchivedFileIndexes(rows, [index()]); expect(result.issues).toHaveLength(1);
    expect(result.issues[0].recordId).toBe(JSON.stringify(["index", "by-value", "file-3", "file-4"]));
  });

  it("does not index an ordinary array or compound key with an invalid member", async () => {
    const values = await records([{ value: [1, null] }, { value: [1, null] }, { value: [true] }, { value: [undefined] }]);
    expect((await inspectArchivedFileIndexes(values, [index()])).issues).toEqual([]);
    const compound = await records([{ value: "PRIVATE", other: null }, { value: "PRIVATE", other: null }, { value: "PRIVATE" }]);
    expect((await inspectArchivedFileIndexes(compound, [index({ keyPath: ["value", "other"] })])).issues).toEqual([]);
  });

  it("expands only the outer multiEntry array and skips invalid or duplicate members within one record", async () => {
    const rows = await records([{ value: ["PRIVATE", "PRIVATE", null, undefined, false, {}, [1, 2], [1, null]] }, { value: [1, 2] }, { value: [[1, 2]] }]);
    const result = await inspectArchivedFileIndexes(rows, [index({ multiEntry: true })]);
    expect(result.issues).toHaveLength(1); expect(result.issues[0].recordId).toBe(JSON.stringify(["index", "by-value", "file-0", "file-2"]));
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("treats a scalar multiEntry value as one key, while an empty outer array creates no entries", async () => {
    const rows = await records([{ value: "PRIVATE" }, { value: ["PRIVATE", "PRIVATE"] }, { value: [] }, { value: [] }]);
    const result = await inspectArchivedFileIndexes(rows, [index({ multiEntry: true })]); expect(result.issues).toHaveLength(1);
    expect(result.issues[0].recordId).toBe(JSON.stringify(["index", "by-value", "file-0", "file-1"]));
  });

  it("reports one conflicting record per index even if several expanded keys conflict", async () => {
    const rows = await records([{ value: ["a"] }, { value: ["b"] }, { value: ["a", "b", "c"] }, { value: ["c"] }]);
    const result = await inspectArchivedFileIndexes(rows, [index({ multiEntry: true })]);
    expect(result.issues.map((issue) => issue.recordId)).toEqual([JSON.stringify(["index", "by-value", "file-0", "file-2"]), JSON.stringify(["index", "by-value", "file-2", "file-3"])]);
    expect(result.summary).toContain("конфликтующих записей: 2");
  });

  it("rejects compound multiEntry metadata without classifying it as a readable checked index", async () => {
    const result = await inspectArchivedFileIndexes(await records([{ value: "PRIVATE" }]), [index({ keyPath: ["value"], multiEntry: true })]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "invalid-file-index-schema", recordId: JSON.stringify(["index", "by-value"]) })]);
    expect(result.summary).toContain("сверены текущие ключи: 0; требуют отдельной сверки: 1; конфликтующих записей: 0");
  });

  it("serializes deeply nested array keys once and supports cancellation inside one large multiEntry record", async () => {
    let nested: unknown = "PRIVATE"; for (let depth = 0; depth < 28; depth++) nested = [nested];
    expect((await inspectArchivedFileIndexes(await records([{ value: nested }, { value: nested }]), [index()])).issues).toHaveLength(1);
    const rows = await records([{ value: Array.from({ length: 1000 }, (_, position) => `PRIVATE-${position}`) }]);
    const controller = new AbortController(); const pending = inspectArchivedFileIndexes(rows, [index({ multiEntry: true })], controller.signal);
    setTimeout(() => controller.abort(), 0); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("applies the same metadata check to learning files and message attachments", async () => {
    const learning = await learningFileBackupFixture(); learning.archive.databases[2].stores[0].indexes.push(index({ keyPath: "type" }));
    const result = await inspectArchivedLearningAttachments(learning.assignments, learning.submissions, learning.archive.databases);
    expect(result.issues.map((issue) => issue.code)).toEqual(["unchecked-learning-files-indexes", "file-unique-index-conflict"]);
    expect(result.issues[1].kind).toBe("assignments"); expect(result.summaries.assignments).toContain("конфликтующих записей: 1");
    const message = await messageFileBackupFixture(); message.archive.databases[1].stores[0].indexes.push(index({ keyPath: ["name", "type"] }));
    const review = await inspectBackupMessaging(message.archive.localStorage, new Set(["student-1", "teacher-1"]), undefined, message.archive.databases);
    expect(review.issues.map((issue) => issue.code)).toEqual(["unchecked-message-files-indexes", "file-unique-index-conflict"]);
    expect(review.issues[1].kind).toBe("messaging"); expect(review.checks[0].message).toContain("конфликтующих записей: 1");
  });

  it("checks expanded multiEntry keys in material records without changing their schema or fields", async () => {
    const state = await materialIndexBackupFixture(); const metadata = state.archive.databases[0].stores[0].indexes[1];
    metadata.keyPath = "метки"; metadata.multiEntry = true;
    for (const record of state.records) {
      if (record.value.type !== "object") throw new Error("Expected material object");
      record.value.entries.push(["метки", { type: "array", value: [{ type: "string", value: "PRIVATE" }, { type: "string", value: "PRIVATE" }, { type: "null" }] }]);
    }
    const before = JSON.stringify(state.archive); const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 5, errors: 1, reviews: 1 });
    expect(result.issues.filter((issue) => issue.code === "file-unique-index-conflict")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before);
  });

  it("does not inspect indexes of unsupported file schemas", async () => {
    const state = await materialIndexBackupFixture(); state.archive.databases[0].version = 99;
    expect((await inspectBackupDocuments(state.archive, "configurator-demo")).issues.map((issue) => issue.code)).toEqual(["unsupported-materials-store"]);
  });

  it("retains every additional duplicate after 200, skips nonunique indexes and supports cancellation", async () => {
    const rows = await records(Array.from({ length: 300 }, () => ({ value: "PRIVATE" })));
    const result = await inspectArchivedFileIndexes(rows, [index()]); expect(result.issues).toHaveLength(299);
    expect(result.issues.at(-1)!.recordId).toBe(JSON.stringify(["index", "by-value", "file-0", "file-299"]));
    expect((await inspectArchivedFileIndexes(rows, [index({ unique: false })])).issues).toEqual([]);
    const controller = new AbortController(); const pending = inspectArchivedFileIndexes(rows, [index()], controller.signal);
    setTimeout(() => controller.abort(), 0); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const stopped = new AbortController(); stopped.abort(); await expect(inspectArchivedFileIndexes([], [], stopped.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses row numbers for unexpected non-string primary keys without exposing their values", async () => {
    const rows = await records([{ value: "PRIVATE" }, { value: "PRIVATE" }]); rows[0].key = { type: "string", value: "file-0" };
    const mixed: { key: BackupValue; value: BackupValue }[] = [rows[0], { key: { type: "number", value: 1 }, value: rows[1].value }];
    expect((await inspectArchivedFileIndexes(mixed, [index()])).issues[0].recordId).toBe(JSON.stringify(["index", "by-value", "file-0", "row:2"]));
  });
});
