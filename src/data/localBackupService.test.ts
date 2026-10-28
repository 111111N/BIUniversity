import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_DATABASES, type AdministrativeBackup, type RawBackupDatabase } from "../domain/localBackup";
import { assertAdministrativeBackupAccess, capturePortalStorage, createLocalBackupService } from "./localBackupService";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";

const command = { actorId: "configurator-demo", actorRevision: 1 };
const memory = (values: Map<string, string>) => ({ get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null });
const empty = (name: string): RawBackupDatabase => ({ name, version: 1, capturedAt: "2026-10-28T10:00:00Z", stores: [] });
const setup = () => {
  const values = new Map([["other-app-token", "private"], ["bi-university-journal-v1:s:g", "{broken json"], ["bi-university-theme", "light"]]);
  const authorize = vi.fn();
  const listDatabases = vi.fn(async () => BACKUP_DATABASES.map(({ name }) => ({ name, version: 1 })));
  const readDatabase = vi.fn(async (name: string) => empty(name));
  const service = createLocalBackupService({ storage: memory(values), authorize, listDatabases, readDatabase, origin: "https://portal.example", basePath: "/BIUniversity/" });
  return { values, authorize, listDatabases, readDatabase, service };
};
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("administrative backup orchestration", () => {
  it("keeps raw corrupt JSON byte-for-byte, original keys, ownership and complete binary content", async () => {
    const state = setup();
    state.readDatabase.mockImplementation(async (name) => name === BACKUP_DATABASES[0].name ? {
      ...empty(name), version: 2, stores: [{ name: "teacher-files", keyPath: "id", autoIncrement: false,
        indexes: [{ name: "scope", keyPath: "scope", unique: false, multiEntry: false }],
        records: [{ key: "id-1", value: { id: "id-1", scope: "cabinet", uploadedBy: "original-owner", blob: new Blob([new Uint8Array([0, 255])], { type: "text/plain" }) } }],
      }],
    } : empty(name));
    const before = [...state.values];
    const exported = await state.service.exportAdministrative(command);
    const archive = JSON.parse(await exported.blob.text()) as AdministrativeBackup;
    expect(archive).toMatchObject({ format: "bi-university-local-backup", version: 1, scope: "administrative", actor: { id: command.actorId, revision: 1 }, consistency: "per-database-readonly-transaction", source: { origin: "https://portal.example", basePath: "/BIUniversity/" } });
    expect(archive.localStorage).toContainEqual({ key: "bi-university-journal-v1:s:g", raw: "{broken json" });
    expect(archive.localStorage).not.toContainEqual(expect.objectContaining({ key: "other-app-token" }));
    expect(archive.databases[0].stores[0]).toMatchObject({ keyPath: "id", indexes: [{ name: "scope" }], records: [{ key: { type: "string", value: "id-1" }, value: { entries: expect.arrayContaining([
      ["scope", { type: "string", value: "cabinet" }], ["uploadedBy", { type: "string", value: "original-owner" }], ["blob", { type: "blob", size: 2, base64: "AP8=", mediaType: "text/plain" }],
    ]) } }] });
    expect(exported.summary).toEqual({ storageEntries: 2, databaseRecords: 1, files: 1, binaryBytes: 2 });
    expect(archive.exclusions.join(" ")).toContain("sessionStorage");
    expect([...state.values]).toEqual(before); expect(state.authorize).toHaveBeenCalledTimes(3);
    expect(exported.filename).toMatch(/^bi-university-backup-[\dTZ-]+\.json$/);
  });
  it("records absent databases without ever opening or creating them", async () => {
    const state = setup(); state.listDatabases.mockResolvedValue([]);
    const archive = JSON.parse(await (await state.service.exportAdministrative(command)).blob.text()) as AdministrativeBackup;
    expect(archive.databases).toHaveLength(3); expect(archive.databases.every((database) => database.version === null && !database.stores.length)).toBe(true);
    expect(state.readDatabase).not.toHaveBeenCalled();
  });
  it("preserves out-of-line assignment File keys and does not invent inline IDs", async () => {
    const state = setup();
    state.readDatabase.mockImplementation(async (name) => ({ ...empty(name), stores: [{ name: "files", keyPath: null, autoIncrement: false, indexes: [], records: [{ key: "attachment-1", value: new File(["answer"], "answer.txt", { lastModified: 42 }) }] }] }));
    const archive = JSON.parse(await (await state.service.exportAdministrative(command)).blob.text()) as AdministrativeBackup;
    expect(archive.databases[2].stores[0]).toMatchObject({ keyPath: null, records: [{ key: { type: "string", value: "attachment-1" }, value: { type: "blob", file: { name: "answer.txt", lastModified: 42 } } }] });
  });
  it("checks access before reading any storage or database", async () => {
    const state = setup(); state.authorize.mockImplementation(() => { throw new Error("Нет доступа"); });
    await expect(state.service.exportAdministrative(command)).rejects.toThrow("Нет доступа");
    expect(state.listDatabases).not.toHaveBeenCalled(); expect(state.readDatabase).not.toHaveBeenCalled();
  });
  it("rejects revoked access after asynchronous reads", async () => {
    const state = setup(); state.authorize.mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.exportAdministrative(command)).rejects.toThrow("Доступ отозван");
  });
  it("does not return a partial export after a failed attachment read", async () => {
    const state = setup(); state.readDatabase.mockRejectedValue(new Error("Чтение прервано"));
    await expect(state.service.exportAdministrative(command)).rejects.toThrow("Чтение прервано"); expect(state.readDatabase).toHaveBeenCalledTimes(1);
  });
  it.each(["change", "add", "delete"])("rejects %s of portal storage during export", async (kind) => {
    const state = setup(); state.readDatabase.mockImplementation(async (name) => {
      if (kind === "change") state.values.set("bi-university-theme", "dark");
      if (kind === "add") state.values.set("bi-university-new", "x");
      if (kind === "delete") state.values.delete("bi-university-theme");
      return empty(name);
    });
    await expect(state.service.exportAdministrative(command)).rejects.toThrow("изменились во время выгрузки");
  });
  it("also catches changes while rechecking the database inventory", async () => {
    const state = setup(); state.listDatabases.mockImplementationOnce(async () => []).mockImplementation(async () => { state.values.set("bi-university-theme", "dark"); return []; });
    await expect(state.service.exportAdministrative(command)).rejects.toThrow("изменились во время выгрузки");
  });
  it("ignores unrelated origin changes and rejects a database version change", async () => {
    const state = setup(); state.readDatabase.mockImplementation(async (name) => { state.values.set("other-app-token", "new"); return empty(name); });
    await expect(state.service.exportAdministrative(command)).resolves.toHaveProperty("blob");
    state.listDatabases.mockResolvedValueOnce([{ name: BACKUP_DATABASES[0].name, version: 1 }]).mockResolvedValueOnce([{ name: BACKUP_DATABASES[0].name, version: 2 }]);
    await expect(state.service.exportAdministrative(command)).rejects.toThrow("версии хранилищ изменились");
  });
  it("propagates cancellation and never logs it as a storage failure", async () => {
    const state = setup(); const controller = new AbortController();
    state.readDatabase.mockImplementation(async (name) => { controller.abort(); return empty(name); });
    await expect(state.service.exportAdministrative({ ...command, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(console.error).not.toHaveBeenCalled();
  });
  it("fails on inaccessible storage instead of exporting an empty archive", () => {
    expect(() => capturePortalStorage({ length: 1, key: () => "bi-university-theme", getItem: () => { throw new Error("Storage denied"); } })).toThrow("Storage denied");
    expect(() => capturePortalStorage({ length: 1, key: () => "bi-university-theme", getItem: () => null })).toThrow("изменились");
  });
});

describe("local configurator access", () => {
  const configure = () => {
    const document = createInitialAccountsDocument();
    const values = new Map([[ACCOUNTS_STORAGE_KEY, JSON.stringify(document)], ["bi-university-demo-account", command.actorId]]);
    vi.stubGlobal("localStorage", memory(values)); return { document, values };
  };
  it("allows only the selected active configurator with the current revision", () => {
    const { values } = configure(); expect(() => assertAdministrativeBackupAccess(command)).not.toThrow();
    expect(() => assertAdministrativeBackupAccess({ ...command, actorRevision: 2 })).toThrow("изменились");
    values.set("bi-university-demo-account", "anna-smirnova");
    expect(() => assertAdministrativeBackupAccess(command)).toThrow("Выбранная учётная запись изменилась");
    expect(() => assertAdministrativeBackupAccess({ actorId: "anna-smirnova", actorRevision: 1 })).toThrow("настройщику");
  });
  it("does not elevate blocked or corrupt accounts through demo fallback", () => {
    const { document, values } = configure();
    const actor = document.accounts.find((account) => account.id === command.actorId)!;
    document.accounts.push({ ...actor, id: "another-configurator", login: "another-configurator" });
    actor.status = "blocked";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(document)); expect(() => assertAdministrativeBackupAccess(command)).toThrow("настройщику");
    values.set(ACCOUNTS_STORAGE_KEY, "bad"); expect(() => assertAdministrativeBackupAccess(command)).toThrow("Не удалось прочитать");
  });
});
