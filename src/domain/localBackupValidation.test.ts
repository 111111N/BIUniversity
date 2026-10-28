import { describe, expect, it } from "vitest";
import { backupFixture } from "../testSupport/localBackup";
import { BACKUP_LIMITS, createBackupBudget, encodeBackupValue, type BackupValue } from "./localBackup";
import { canonicalBackupValue, validateAdministrativeBackup } from "./localBackupValidation";

const withRecord = async (value: unknown = new File([new Uint8Array([0, 255])], "answer.txt", { lastModified: 42 })) => {
  const archive = backupFixture(); const budget = createBackupBudget(); const encoded = await encodeBackupValue(value, budget);
  archive.databases[2] = { name: "bi-university-learning-files", version: 1, capturedAt: archive.completedAt, stores: [{ name: "files", keyPath: null, autoIncrement: false, indexes: [], records: [{ key: { type: "string", value: "original-key" }, value: encoded }] }] };
  archive.totals = { storageEntries: 0, databaseRecords: 1, files: budget.files, binaryBytes: budget.binaryBytes }; return archive;
};
describe("untrusted backup validation", () => {
  it("accepts JSON v1 with absent databases and tagged File values from the actual encoder", async () => {
    const archive = await withRecord(); const encoded = JSON.parse(JSON.stringify(archive));
    expect(await validateAdministrativeBackup(encoded)).toEqual(archive);
    expect(await validateAdministrativeBackup(backupFixture())).toEqual(backupFixture());
  });
  it.each([
    ["future version", { version: 2 }], ["wrong scope", { scope: "personal" }], ["foreign format", { format: "other" }],
    ["unknown root fields", { restoreNow: true }], ["invalid origin", { source: { origin: "javascript:alert(1)", basePath: "/" } }],
    ["invalid timestamp", { completedAt: "yesterday" }], ["invalid author", { actor: { id: "", revision: 0 } }],
    ["unsupported consistency", { consistency: "atomic" }], ["missing databases", { databases: [] }],
  ])("rejects %s", async (_name, patch) => {
    await expect(validateAdministrativeBackup({ ...backupFixture(), ...patch })).rejects.toThrow("повреждён или несовместим");
  });
  it("preserves invalid inner JSON for later semantic review but rejects foreign and duplicate persistent keys", async () => {
    const archive = backupFixture(); archive.localStorage = [{ key: "bi-university-accounts-v1", raw: "{bad" }]; archive.totals.storageEntries = 1;
    expect((await validateAdministrativeBackup(archive)).localStorage[0].raw).toBe("{bad");
    archive.localStorage.push({ ...archive.localStorage[0] }); archive.totals.storageEntries++;
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("повторяющийся ключ");
    archive.localStorage = [{ key: "another-app-password", raw: "secret" }]; archive.totals.storageEntries = 1;
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("посторонний ключ");
  });
  it("rejects repeated databases, missing required stores and records under absent databases", async () => {
    const archive = backupFixture(); archive.databases[1] = { ...archive.databases[0] };
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("повторяющийся ключ");
    const record = await withRecord(); record.databases[2].stores[0].name = "not-files";
    await expect(validateAdministrativeBackup(record)).rejects.toThrow("обязательное хранилище");
    record.databases[2].stores[0].name = "files"; record.databases[2].version = null;
    await expect(validateAdministrativeBackup(record)).rejects.toThrow("отсутствующей базе");
  });
  it("rejects duplicate record IDs and impossible primary keys", async () => {
    const archive = await withRecord(); const store = archive.databases[2].stores[0]; store.records.push({ ...store.records[0] });
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("повторяющийся ключ");
    store.records.pop(); store.records[0].key = { type: "boolean", value: true };
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("первичный ключ");
  });
  it.each(["!!8=", "AP9=", "AP8", "AP8==", "AP8A"])("rejects corrupt or noncanonical binary data %s", async (base64) => {
    const archive = await withRecord(); (archive.databases[2].stores[0].records[0].value as { base64: string }).base64 = base64;
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("вложени");
  });
  it("rejects mismatched totals, extra tagged fields and duplicate object keys", async () => {
    const archive = await withRecord(); archive.totals.files++;
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("итоги не совпадают");
    archive.totals.files--; Object.assign(archive.databases[2].stores[0].records[0].value, { url: "https://invalid" });
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("неизвестные поля");
    const duplicate = await withRecord({ scope: "owner" });
    const node = duplicate.databases[2].stores[0].records[0].value;
    if (node.type !== "object") throw new Error("Fixture must be object"); node.entries.push([...node.entries[0]]);
    await expect(validateAdministrativeBackup(duplicate)).rejects.toThrow("повторяющийся ключ");
  });
  it("bounds declared binary sizes before reading or decoding data", async () => {
    const archive = await withRecord(); Object.assign(archive.databases[2].stores[0].records[0].value, { size: BACKUP_LIMITS.binaryBytes + 1 });
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("64 МиБ");
  });
  it("stops deeply nested metadata and honours cancellation", async () => {
    const archive = backupFixture() as unknown as Record<string, unknown>; let value: unknown = "end";
    for (let index = 0; index < 140; index++) value = [value]; archive.extra = value;
    await expect(validateAdministrativeBackup(archive)).rejects.toThrow("слишком сложный");
    const controller = new AbortController(); controller.abort();
    await expect(validateAdministrativeBackup(backupFixture(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("compares object content regardless of property order without confusing types or array order", () => {
    const a: BackupValue = { type: "object", entries: [["id", { type: "string", value: "1" }], ["scope", { type: "string", value: "owner" }]] };
    const b: BackupValue = { type: "object", entries: [...a.entries].reverse() };
    expect(canonicalBackupValue(a)).toBe(canonicalBackupValue(b));
    expect(canonicalBackupValue({ type: "string", value: "1" })).not.toBe(canonicalBackupValue({ type: "number", value: 1 }));
    expect(canonicalBackupValue({ type: "undefined" })).not.toBe(canonicalBackupValue({ type: "null" }));
  });
});
