import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_DATABASES, BACKUP_LIMITS, type RawBackupDatabase } from "../domain/localBackup";
import { backupFixture, backupTime, rawBackupDatabase } from "../testSupport/localBackup";
import { createLocalBackupService, type BackupDependencies } from "./localBackupService";
import { createBackupInspectionService } from "./localBackupInspectionService";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";

const command = { actorId: "configurator-demo", actorRevision: 1 };
const setup = () => {
  const values = new Map([["bi-university-theme", "light"], ["bi-university-demo-account", "configurator-demo"]]);
  const databases = new Map<string, RawBackupDatabase>();
  const authorize = vi.fn();
  const listDatabases = vi.fn(async () => [...databases.values()].map(({ name, version }) => ({ name, version: version ?? undefined })));
  const readDatabase = vi.fn(async (name: string) => databases.get(name)!);
  const dependencies: BackupDependencies = {
    storage: { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null },
    authorize, listDatabases, readDatabase, origin: "https://portal.example", basePath: "/BIUniversity/",
  };
  const exportFile = async () => { const result = await createLocalBackupService(dependencies).exportAdministrative(command); return new File([result.blob], "archive.json", { type: "application/json" }); };
  return { values, databases, authorize, readDatabase, listDatabases, dependencies, exportFile, service: createBackupInspectionService(dependencies) };
};
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(backupTime); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("read-only backup inspection", () => {
  it("roundtrips a real export, comparing overlapping IDs by content and retaining all current-only data", async () => {
    const state = setup();
    state.values.set("bi-university-same", '{"v":1}'); state.values.set("bi-university-removed", '"old"');
    const database = rawBackupDatabase(BACKUP_DATABASES[2].name, "files");
    const file = () => new File([new Uint8Array([0, 255])], "answer.bin", { type: "application/octet-stream", lastModified: 42 });
    database.stores[0].records = [
      { key: "same", value: { scope: "user:original-owner", blob: file() } },
      { key: "changed", value: new Blob(["old"]) }, { key: "removed", value: "record" },
    ]; state.databases.set(database.name, database);
    const archive = await state.exportFile();
    state.values.set("bi-university-theme", "dark"); state.values.delete("bi-university-removed"); state.values.set("bi-university-new", "[]");
    database.stores[0].records = [
      { key: "same", value: { blob: file(), scope: "user:original-owner" } },
      { key: "changed", value: new Blob(["new"]) }, { key: "current-only", value: "current" },
    ];
    const before = [...state.values]; const records = [...database.stores[0].records];
    const report = await state.service.inspect({ ...command, file: archive });
    expect(report.comparison).toMatchObject({ same: 3, new: 2, different: 2, currentOnly: 2, schema: 0 });
    expect(report.comparison.differences).toContainEqual({ kind: "different", area: "Файлы заданий и ответов · files", id: "changed" });
    expect(report.comparison.differences).toContainEqual({ kind: "current-only", area: "Локальные данные", id: "bi-university-new" });
    expect(report.sha256).toBe(createHash("sha256").update(new Uint8Array(await archive.arrayBuffer())).digest("hex"));
    expect([...state.values]).toEqual(before); expect(database.stores[0].records).toEqual(records);
    expect(report).not.toHaveProperty("archive"); expect(JSON.stringify(report)).not.toContain("base64");
  });
  it("inspects valid absent databases without opening them and does not warn about known string preferences", async () => {
    const state = setup(); state.values.set("bi-university-planner-view", "board"); state.values.set("bi-university-schedule-view:teacher:one", "list");
    const report = await state.service.inspect({ ...command, file: await state.exportFile() });
    expect(state.readDatabase).not.toHaveBeenCalled(); expect(report.comparison.differences).toEqual([]);
    expect(report.warnings.join(" ")).not.toContain("исходные строки");
  });
  it("reports source and raw JSON warnings without interpreting them as authorization or successful restoration", async () => {
    const state = setup(); const archive = backupFixture(); archive.source.origin = "https://other.example";
    archive.localStorage = [{ key: "bi-university-accounts-v1", raw: "{broken" }]; archive.totals.storageEntries = 1;
    const report = await state.service.inspect({ ...command, file: new File([JSON.stringify(archive)], "other.json") });
    expect(report.warnings.join(" ")).toContain("другому адресу"); expect(report.warnings.join(" ")).toContain("исходные строки"); expect(report.warnings.join(" ")).toContain("не подписан");
    expect(report.warnings.join(" ")).toContain("ещё не проверены");
    expect(report.documents.checks.find((check) => check.kind === "accounts")).toMatchObject({ status: "invalid", message: "Некорректный JSON внутри документа." });
  });
  it("reports incompatible inner documents without losing the readonly comparison or substituting live accounts", async () => {
    const state = setup(); const fixture = coreBackupFixture(); fixture.accounts.accounts[0].status = "blocked"; fixture.save();
    state.dependencies.documentBaseline = { groupIds: [], requiredSubjectIds: ["subject-1"] };
    const report = await state.service.inspect({ ...command, file: new File([JSON.stringify(fixture.archive)], "accounts-without-access.json") });
    expect(report.documents.counts).toMatchObject({ invalid: 1, valid: 3 });
    expect(report.documents.checks[0].message).toContain("отсутствует активный настройщик"); expect(report.comparison.new).toBe(4); expect(state.values.get("bi-university-demo-account")).toBe("configurator-demo");
  });
  it("uses the supplied application baseline and reports missing built-in subjects", async () => {
    const state = setup(); state.dependencies.documentBaseline = { groupIds: [], requiredSubjectIds: ["not-in-this-archive"] };
    const report = await state.service.inspect({ ...command, file: new File([JSON.stringify(coreBackupFixture().archive)], "other-version.json") });
    expect(report.documents.checks.find((check) => check.kind === "subjects")).toMatchObject({ status: "invalid" });
  });
  it("reports presence, schema, indexes and version differences independently of record ID conflicts", async () => {
    const state = setup(); const original = rawBackupDatabase(BACKUP_DATABASES[0].name, "teacher-files");
    state.databases.set(original.name, original); const archive = await state.exportFile();
    original.version = 2; original.stores[0].keyPath = "id"; original.stores[0].indexes.push({ name: "scope", keyPath: "scope", unique: false, multiEntry: false });
    const report = await state.service.inspect({ ...command, file: archive });
    expect(report.comparison.schema).toBe(2); expect(report.comparison.different).toBe(0);
  });
  it("checks rights before reading a file or current databases", async () => {
    const state = setup(); const file = new File([JSON.stringify(backupFixture())], "archive.json"); const read = vi.spyOn(file, "arrayBuffer");
    state.authorize.mockImplementation(() => { throw new Error("Нет доступа"); });
    await expect(state.service.inspect({ ...command, file })).rejects.toThrow("Нет доступа");
    expect(read).not.toHaveBeenCalled(); expect(state.listDatabases).not.toHaveBeenCalled();
  });
  it("explains unavailable Web Crypto before comparing current data", async () => {
    const state = setup(); const file = new File([JSON.stringify(backupFixture())], "archive.json"); vi.stubGlobal("crypto", {});
    await expect(state.service.inspect({ ...command, file })).rejects.toThrow("недоступно вычисление отпечатка"); expect(state.listDatabases).not.toHaveBeenCalled();
  });
  it.each(["empty", "oversized", "broken", "invalid-utf8", "future", "totals"])("rejects %s before reading current data", async (kind) => {
    const state = setup(); let file: File;
    if (kind === "empty") file = new File([], "empty.json");
    else if (kind === "broken") file = new File(["{oops"], "broken.json");
    else if (kind === "invalid-utf8") file = new File([new Uint8Array([0xff])], "invalid.json");
    else {
      const archive = backupFixture(); if (kind === "future") Object.assign(archive, { version: 99 }); if (kind === "totals") archive.totals.files++;
      file = new File([JSON.stringify(archive)], "archive.json");
      if (kind === "oversized") Object.defineProperty(file, "size", { value: BACKUP_LIMITS.archiveBytes + 1 });
    }
    await expect(state.service.inspect({ ...command, file })).rejects.toThrow(); expect(state.readDatabase).not.toHaveBeenCalled(); expect(state.listDatabases).not.toHaveBeenCalled();
  });
  it("never returns a partial report if the current file store cannot be read", async () => {
    const state = setup(); const archive = new File([JSON.stringify(backupFixture())], "archive.json");
    state.databases.set(BACKUP_DATABASES[0].name, rawBackupDatabase(BACKUP_DATABASES[0].name, "teacher-files")); state.readDatabase.mockRejectedValue(new Error("Чтение недоступно"));
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("Чтение недоступно");
  });
  it("rejects a current-source change during comparison", async () => {
    const state = setup(); const archive = await state.exportFile();
    state.listDatabases.mockImplementation(async () => { state.values.set("bi-university-theme", "dark"); return []; });
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("изменились во время сравнения");
  });
  it("rechecks access after reading the file and after comparing current data", async () => {
    const state = setup(); const archive = await state.exportFile(); state.authorize.mockReset();
    state.authorize.mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("Доступ отозван");
    state.authorize.mockReset().mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined).mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error("Доступ отозван"); });
    await expect(state.service.inspect({ ...command, file: archive })).rejects.toThrow("Доступ отозван");
  });
  it("propagates cancellation after file I/O without logging or comparing current data", async () => {
    const state = setup(); const controller = new AbortController(); const file = new File(["{}"], "archive.json");
    vi.spyOn(file, "arrayBuffer").mockImplementation(async () => { controller.abort(); return new ArrayBuffer(0); });
    await expect(state.service.inspect({ ...command, file, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(state.listDatabases).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
});
