import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedMaterials } from "./backupMaterials";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { coreBackupFixture, materialBackupFixture } from "../testSupport/localBackupDocuments";
import type { BackupValue } from "./localBackup";

const sources = () => ({ accountIds: new Set(["teacher-1"]), subjectIds: new Set(["subject-1"]), groupIds: new Set(["group-1"]) });
type Fixture = Awaited<ReturnType<typeof materialBackupFixture>>;
const field = (fixture: Fixture, name: string, value?: BackupValue) => {
  const row = fixture.records[0].value; if (row.type !== "object") throw new Error("Expected encoded material");
  const index = row.entries.findIndex(([key]) => key === name);
  if (value === undefined) { if (index >= 0) row.entries.splice(index, 1); }
  else if (index >= 0) row.entries[index][1] = value;
  else row.entries.push([name, value]);
};
const forbidden = vi.fn(() => { throw new Error("Material inspection must not open or upgrade live databases, infer demo owners or decode files"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); vi.stubGlobal("atob", forbidden); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("archived materials", () => {
  it("reads a current material and its declared owner without exposing names, descriptions or bytes", async () => {
    const fixture = await materialBackupFixture(); const before = JSON.stringify(fixture.archive);
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    expect(review.counts).toMatchObject({ valid: 5, invalid: 0, absent: 8, errors: 0, reviews: 0 });
    expect(review.checks.find((check) => check.kind === "materials")).toMatchObject({ status: "valid", records: 1 });
    expect(review.checks.find((check) => check.kind === "materials")!.message).toContain("Областей с найденными ID архива: 1; не подтверждено: 0");
    expect(JSON.stringify(review)).not.toContain("PRIVATE"); expect(JSON.stringify(review)).not.toContain("base64"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("distinguishes an absent database from a saved empty store", async () => {
    const absent = await inspectArchivedMaterials(coreBackupFixture().archive.databases, sources()); expect(absent.checks[0]).toMatchObject({ status: "absent" }); expect(absent.issues).toEqual([]);
    const fixture = await materialBackupFixture(); fixture.records.length = 0;
    const empty = await inspectArchivedMaterials(fixture.archive.databases, sources()); expect(empty.checks[0]).toMatchObject({ status: "valid", records: 0 }); expect(empty.issues).toEqual([]);
  });

  it.each(["subject:subject-1", "group:subject-1:group-1"])("checks declared academic scope %s against archived IDs", async (scope) => {
    const fixture = await materialBackupFixture(); field(fixture, "scope", { type: "string", value: scope });
    expect((await inspectArchivedMaterials(fixture.archive.databases, sources())).issues).toEqual([]);
  });

  it.each(["cabinet", "", undefined])("does not assign an owner to a legacy common scope: %s", async (scope) => {
    const fixture = await materialBackupFixture(); field(fixture, "scope", scope === undefined ? undefined : { type: "string", value: scope });
    const before = JSON.stringify(fixture.archive); const result = await inspectArchivedMaterials(fixture.archive.databases, sources());
    expect(result.checks[0].status).toBe("valid"); expect(result.issues).toEqual([expect.objectContaining({ level: "review", code: "legacy-material-owner", recordId: "material-1" })]);
    expect(JSON.stringify(fixture.archive)).toBe(before);
  });

  it("reads version 1 without upgrading or fabricating its missing scope index", async () => {
    const fixture = await materialBackupFixture(); fixture.archive.databases[0].version = 1; fixture.archive.databases[0].stores[0].indexes.length = 0; field(fixture, "scope");
    const result = await inspectArchivedMaterials(fixture.archive.databases, sources());
    expect(result.checks[0]).toMatchObject({ status: "valid", records: 1 }); expect(result.issues.map((issue) => issue.code)).toEqual(["legacy-materials-store", "legacy-material-owner"]);
  });

  it.each(["id", "size", "type", "createdAt", "blob", "pinned", "scope"])("reports a damaged %s field without interpreting a readable subset of that record", async (name) => {
    const fixture = await materialBackupFixture(); field(fixture, name, { type: "null" });
    const result = await inspectArchivedMaterials(fixture.archive.databases, sources());
    expect(result.checks[0]).toMatchObject({ status: "invalid", records: 1 }); expect(result.issues.map((issue) => issue.code)).toEqual(["invalid-material-record"]);
    expect(result.checks[0].message).toContain("прочитано: 0; не читается: 1");
  });

  it.each(["size", "type", "name"])("separates a readable record from a binary metadata conflict: %s", async (name) => {
    const fixture = await materialBackupFixture(); field(fixture, name, name === "size" ? { type: "number", value: 1 } : { type: "string", value: "PRIVATE CONFLICT" });
    const result = await inspectArchivedMaterials(fixture.archive.databases, sources());
    expect(result.checks[0].status).toBe("valid"); expect(result.issues).toEqual([expect.objectContaining({ level: "error", code: "material-blob-mismatch", recordId: "material-1" })]); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("validates the inline ID and accepts legacy Blob metadata without inventing a file name", async () => {
    const fixture = await materialBackupFixture(); const row = fixture.records[0].value;
    if (row.type !== "object") throw new Error("Expected material"); const blob = row.entries.find(([key]) => key === "blob")![1];
    if (blob.type !== "blob") throw new Error("Expected blob"); delete blob.file;
    expect((await inspectArchivedMaterials(fixture.archive.databases, sources())).issues).toEqual([]);
    field(fixture, "id", { type: "string", value: "another-id" });
    expect((await inspectArchivedMaterials(fixture.archive.databases, sources())).issues.map((issue) => issue.code)).toEqual(["invalid-material-record"]);
  });

  it("does not replace a missing owner with an uploadedBy display name or reject an existing owner with a new role", async () => {
    const fixture = await materialBackupFixture(); field(fixture, "scope", { type: "string", value: "user:missing-owner" }); field(fixture, "uploadedBy", { type: "string", value: fixture.accounts.accounts[1].name });
    const result = await inspectBackupDocuments(fixture.archive, "configurator-demo"); expect(result.issues).toEqual([expect.objectContaining({ code: "missing-material-owner" })]); expect(JSON.stringify(result)).not.toContain(fixture.accounts.accounts[1].name);
    field(fixture, "scope", { type: "string", value: "user:teacher-1" }); fixture.accounts.accounts[1].role = "configurator"; fixture.accounts.accounts[1].memberships = []; fixture.save();
    expect((await inspectBackupDocuments(fixture.archive, "configurator-demo")).issues).toEqual([]);
  });

  it.each(["user:", "user:%", "user:%74eacher-1", "user:a:b", "user:%2f"])("leaves malformed/noncanonical personal scopes unresolved: %s", async (scope) => {
    const fixture = await materialBackupFixture(); field(fixture, "scope", { type: "string", value: scope });
    expect((await inspectArchivedMaterials(fixture.archive.databases, sources())).issues.map((issue) => issue.code)).toEqual(["invalid-material-scope"]);
  });

  it("resolves an encoded owner and literal academic IDs without guessing a colon boundary", async () => {
    const fixture = await materialBackupFixture(); field(fixture, "scope", { type: "string", value: "user:a%3Ab" });
    expect((await inspectArchivedMaterials(fixture.archive.databases, { ...sources(), accountIds: new Set(["a:b"]) })).issues).toEqual([]);
    field(fixture, "scope", { type: "string", value: "group:a:b:c" });
    expect((await inspectArchivedMaterials(fixture.archive.databases, { ...sources(), subjectIds: new Set(["a", "a:b"]), groupIds: new Set(["b:c", "c"]) })).issues.map((issue) => issue.code)).toEqual(["ambiguous-material-area"]);
    expect((await inspectArchivedMaterials(fixture.archive.databases, { ...sources(), subjectIds: new Set(["a:b"]), groupIds: new Set(["c"]) })).issues).toEqual([]);
  });

  it.each(["subject:missing", "group:subject-1:missing", "unknown:PRIVATE"])("does not normalize an unresolved academic/unknown scope: %s", async (scope) => {
    const fixture = await materialBackupFixture(); field(fixture, "scope", { type: "string", value: scope });
    const result = await inspectArchivedMaterials(fixture.archive.databases, sources()); expect(result.issues).toHaveLength(1); expect(result.issues[0].level).toBe("review"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("keeps missing source catalogs distinct from missing target IDs and never uses built-in groups", async () => {
    const fixture = await materialBackupFixture(); fixture.archive.localStorage = fixture.archive.localStorage.filter((entry) => entry.key !== BACKUP_CORE_DOCUMENTS.accounts.key);
    let review = await inspectBackupDocuments(fixture.archive, "configurator-demo"); expect(review.issues).toContainEqual(expect.objectContaining({ code: "unchecked-material-accounts" }));
    expect(review.issues.some((issue) => issue.code === "missing-material-owner")).toBe(false);
    fixture.save(); field(fixture, "scope", { type: "string", value: "group:subject-1:group-1" }); fixture.groups.groups.length = 0; fixture.save();
    review = await inspectBackupDocuments(fixture.archive, "configurator-demo", { groupIds: ["group-1"], requiredSubjectIds: [] });
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "unresolved-material-area" }));
  });

  it.each(["version", "keyPath", "autoIncrement", "missing-index", "unique-index", "wrong-index"])("does not inspect records under an unsupported %s schema", async (change) => {
    const fixture = await materialBackupFixture(); const database = fixture.archive.databases[0]; const store = database.stores[0];
    if (change === "version") database.version = 99;
    if (change === "keyPath") store.keyPath = null;
    if (change === "autoIncrement") store.autoIncrement = true;
    if (change === "missing-index") store.indexes.length = 0;
    if (change === "unique-index") store.indexes[0].unique = true;
    if (change === "wrong-index") store.indexes[0].keyPath = "other";
    const result = await inspectArchivedMaterials(fixture.archive.databases, sources()); expect(result.checks[0].status).toBe("invalid"); expect(result.checks[0].records).toBeUndefined(); expect(result.issues.map((issue) => issue.code)).toEqual(["unsupported-materials-store"]);
  });

  it("keeps other records readable and extra indexes visible instead of hiding bad records", async () => {
    const fixture = await materialBackupFixture(); fixture.records.push({ key: { type: "string", value: "bad-file" }, value: { type: "null" } });
    fixture.archive.databases[0].stores[0].indexes.push({ name: "custom", keyPath: "category", unique: false, multiEntry: false });
    const result = await inspectArchivedMaterials(fixture.archive.databases, sources()); expect(result.checks[0]).toMatchObject({ status: "invalid", records: 2 }); expect(result.checks[0].message).toContain("прочитано: 1; не читается: 1");
    expect(result.issues.map((issue) => issue.code)).toEqual(["unchecked-material-indexes", "invalid-material-record"]);
  });

  it("retains all findings beyond 200 and supports cancellation without returning a partial result", async () => {
    const fixture = await materialBackupFixture(); const original = fixture.records[0].value; if (original.type !== "object") throw new Error("Expected material");
    fixture.records.splice(0, 1, ...Array.from({ length: 300 }, (_, index) => ({ key: { type: "string" as const, value: `file-${index}` }, value: { type: "object" as const, entries: original.entries.map(([key, value]): [string, BackupValue] => [key, key === "id" ? { type: "string", value: `file-${index}` } : value]) } })));
    const result = await inspectArchivedMaterials(fixture.archive.databases, { ...sources(), accountIds: new Set() }); expect(result.issues).toHaveLength(300); expect(result.issues.at(-1)?.recordId).toBe("file-299");
    const controller = new AbortController(); const pending = inspectArchivedMaterials(fixture.archive.databases, sources(), controller.signal); const timer = setTimeout(() => controller.abort(), 0);
    try { await expect(pending).rejects.toMatchObject({ name: "AbortError" }); } finally { clearTimeout(timer); }
    const aborted = new AbortController(); aborted.abort(); await expect(inspectArchivedMaterials([], sources(), aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
