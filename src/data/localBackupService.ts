import { authorizeAccountCommand } from "../domain/accounts";
import { BACKUP_DATABASES, BACKUP_LIMITS, addBackupText, checkBackupAbort, createBackupBudget, encodeBackupValue, isPortalStorageKey, type AdministrativeBackup, type RawBackupDatabase } from "../domain/localBackup";
import { readAccountsState } from "./accountStore";
import { readExistingBackupDatabase } from "./localBackupIndexedDb";
import type { BackupDocumentBaseline } from "../domain/localBackupDocuments";
import { DEMO_GROUPS, DEMO_SUBJECTS } from "./academicCatalog";

export interface BackupCommand { actorId: string; actorRevision: number; signal?: AbortSignal; onProgress?: (message: string) => void }
export interface BackupExport { blob: Blob; filename: string; summary: AdministrativeBackup["totals"]; completedAt: string }
export type BackupReceipt = Omit<BackupExport, "blob">;
export interface LocalBackupService { exportAdministrative(command: BackupCommand): Promise<BackupExport> }

export const assertAdministrativeBackupAccess = (command: Pick<BackupCommand, "actorId" | "actorRevision">) => {
  const state = readAccountsState();
  if (state.error) throw new Error(state.error);
  authorizeAccountCommand({ version: 1, ...state }, { ...command, expectedRevision: state.revision });
  if (localStorage.getItem("bi-university-demo-account") !== command.actorId) throw new Error("Выбранная учётная запись изменилась. Повторите выгрузку из учётной записи настройщика.");
};

export const capturePortalStorage = (storage: Pick<Storage, "length" | "key" | "getItem">) => {
  const entries: AdministrativeBackup["localStorage"] = [];
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key && isPortalStorageKey(key)) keys.push(key); }
  for (const key of keys.sort()) { const raw = storage.getItem(key); if (raw === null) throw new Error("Локальные данные изменились во время чтения. Повторите выгрузку."); entries.push({ key, raw }); }
  return entries;
};

export interface BackupDependencies {
  storage: Pick<Storage, "length" | "key" | "getItem">;
  authorize(command: Pick<BackupCommand, "actorId" | "actorRevision">): void;
  listDatabases(): ReturnType<IDBFactory["databases"]>;
  readDatabase(name: string, requiredStore: string, signal?: AbortSignal): Promise<RawBackupDatabase>;
  origin: string; basePath: string;
  documentBaseline?: BackupDocumentBaseline;
}

export const createLocalBackupService = (dependencies: BackupDependencies): LocalBackupService => ({
  async exportAdministrative(command) {
    try {
      checkBackupAbort(command.signal);
      dependencies.authorize(command);
      const startedAt = new Date().toISOString();
      command.onProgress?.("Читаем локальные данные…");
      const entries = capturePortalStorage(dependencies.storage);
      const budget = createBackupBudget();
      for (const entry of entries) { addBackupText(budget, entry.key); addBackupText(budget, entry.raw); }
      const available = await dependencies.listDatabases();
      const databases: AdministrativeBackup["databases"] = [];
      for (const source of BACKUP_DATABASES) {
        checkBackupAbort(command.signal);
        command.onProgress?.(`Читаем вложения: ${databases.length + 1} из ${BACKUP_DATABASES.length}…`);
        if (!available.some((item) => item.name === source.name)) {
          databases.push({ name: source.name, version: null, capturedAt: new Date().toISOString(), stores: [] });
          continue;
        }
        const raw = await dependencies.readDatabase(source.name, source.store, command.signal);
        const database: AdministrativeBackup["databases"][number] = { ...raw, stores: [] };
        for (const store of raw.stores) {
          const records: AdministrativeBackup["databases"][number]["stores"][number]["records"] = [];
          for (const record of store.records) {
            if (++budget.records > BACKUP_LIMITS.records) throw new Error("В локальных хранилищах больше 25 000 записей. Архив не создан.");
            if (budget.records % 128 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(command.signal); }
            records.push({ key: await encodeBackupValue(record.key, budget, command.signal), value: await encodeBackupValue(record.value, budget, command.signal) });
          }
          database.stores.push({ ...store, records });
        }
        databases.push(database);
      }
      const completedAt = new Date().toISOString();
      const archive: AdministrativeBackup = {
        format: "bi-university-local-backup", version: 1, scope: "administrative", startedAt, completedAt,
        actor: { id: command.actorId, revision: command.actorRevision }, source: { origin: dependencies.origin, basePath: dependencies.basePath },
        consistency: "per-database-readonly-transaction",
        exclusions: ["sessionStorage: временные черновики", "несохранённые изменения форм", "встроенные примеры, ещё не сохранённые в хранилища", "данные других адресов, браузеров и устройств", "ключи localStorage вне пространства bi-university- и неизвестные базы IndexedDB"],
        localStorage: entries, databases,
        totals: { storageEntries: entries.length, databaseRecords: budget.records, files: budget.files, binaryBytes: budget.binaryBytes },
      };
      command.onProgress?.("Готовим файл…");
      const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
      if (blob.size > BACKUP_LIMITS.archiveBytes) throw new Error("Размер архива превышает 128 МиБ. Файл не создан.");
      checkBackupAbort(command.signal);
      dependencies.authorize(command);
      const latest = await dependencies.listDatabases();
      if (BACKUP_DATABASES.some(({ name }) => available.find((item) => item.name === name)?.version !== latest.find((item) => item.name === name)?.version)) throw new Error("Состав или версии хранилищ изменились. Повторите выгрузку.");
      checkBackupAbort(command.signal);
      dependencies.authorize(command);
      if (JSON.stringify(capturePortalStorage(dependencies.storage)) !== JSON.stringify(entries)) throw new Error("Локальные данные изменились во время выгрузки. Повторите её, завершив редактирование в других вкладках.");
      return { blob, filename: `bi-university-backup-${completedAt.replace(/[:.]/g, "-")}.json`, summary: archive.totals, completedAt };
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось выгрузить локальные данные портала:", error);
      throw error;
    }
  },
});

export const createBrowserBackupDependencies = (): BackupDependencies => ({
      storage: localStorage, authorize: assertAdministrativeBackupAccess, origin: window.location.origin, basePath: import.meta.env.BASE_URL,
      documentBaseline: { groupIds: DEMO_GROUPS.map((group) => group.id), requiredSubjectIds: DEMO_SUBJECTS.map((subject) => subject.id) },
      listDatabases: () => {
        if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return Promise.reject(new Error("Браузер не поддерживает безопасную проверку хранилищ. Выгрузка недоступна; исходные данные сохранены."));
        return indexedDB.databases();
      },
      readDatabase: (name, store, signal) => readExistingBackupDatabase(indexedDB, name, store, signal),
});

export const localBackupService: LocalBackupService = {
  exportAdministrative(command) {
    return createLocalBackupService(createBrowserBackupDependencies()).exportAdministrative(command);
  },
};
