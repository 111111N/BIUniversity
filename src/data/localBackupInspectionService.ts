import { BACKUP_DATABASES, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue, type AdministrativeBackup, type BackupStoreMetadata } from "../domain/localBackup";
import { canonicalBackupValue, validateAdministrativeBackup } from "../domain/localBackupValidation";
import { capturePortalStorage, createBrowserBackupDependencies, type BackupCommand, type BackupDependencies } from "./localBackupService";
import { inspectBackupDocuments, type BackupDocumentReview } from "../domain/localBackupDocuments";

export type BackupDifferenceKind = "new" | "different" | "current-only" | "schema";
export interface BackupDifference { kind: BackupDifferenceKind; area: string; id: string }
export interface BackupInspection {
  filename: string; source: AdministrativeBackup["source"]; completedAt: string; inspectedAt: string; sha256: string;
  totals: AdministrativeBackup["totals"]; warnings: string[]; documents: BackupDocumentReview;
  comparison: { same: number; new: number; different: number; currentOnly: number; schema: number; differences: BackupDifference[] };
}
export interface BackupInspectionCommand extends BackupCommand { file: File }
const areaNames: Record<string, string> = {
  "bi-university-cabinet": "Материалы", "bi-university-message-files": "Вложения сообщений", "bi-university-learning-files": "Файлы заданий и ответов",
};
const schemaKey = (store: BackupStoreMetadata) => JSON.stringify({ keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes: [...store.indexes].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).map((index) => [index.name, index.keyPath, index.unique, index.multiEntry]) });
const recordLabel = (key: AdministrativeBackup["databases"][number]["stores"][number]["records"][number]["key"]) => key.type === "string" ? key.value : canonicalBackupValue(key);

export const createBackupInspectionService = (dependencies: BackupDependencies) => ({
  async inspect(command: BackupInspectionCommand): Promise<BackupInspection> {
    try {
      checkBackupAbort(command.signal); dependencies.authorize(command);
      if (!command.file.size || command.file.size > BACKUP_LIMITS.archiveBytes) throw new Error("Выберите непустой архив JSON размером не более 128 МиБ.");
      command.onProgress?.("Читаем и проверяем файл…");
      const bytes = await command.file.arrayBuffer(); checkBackupAbort(command.signal);
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("Не удалось прочитать JSON в кодировке UTF-8. Выберите исходный файл резервной копии."); }
      const archive = await validateAdministrativeBackup(parsed, command.signal);
      dependencies.authorize(command);
      if (typeof crypto === "undefined" || typeof crypto.subtle?.digest !== "function") throw new Error("Браузеру недоступно вычисление отпечатка файла. Проверка архива остановлена; исходные данные не изменены.");
      const digest = await crypto.subtle.digest("SHA-256", bytes); checkBackupAbort(command.signal);
      const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      command.onProgress?.("Проверяем документы и учебные ссылки архива…");
      const documents = await inspectBackupDocuments(archive, command.actorId, dependencies.documentBaseline, command.signal);
      dependencies.authorize(command);
      const warnings = ["Результаты проверки поддерживаемых документов и их ссылок указаны отдельно. Внутренние схемы остальных записей, владельцы вложений и возможность восстановления ещё не проверены.", "Архив не подписан: совпадение формата и отпечаток файла не подтверждают его автора и подлинность."];
      if (archive.source.origin !== dependencies.origin || archive.source.basePath !== dependencies.basePath) warnings.push("Архив создан по другому адресу портала. Совпадение ID между разными установками требует отдельной проверки.");
      for (const entry of archive.localStorage) {
        if (!["bi-university-theme", "bi-university-demo-account", "bi-university-demo-role", "bi-university-planner-view"].includes(entry.key) && !entry.key.startsWith("bi-university-schedule-view:")) {
          try { JSON.parse(entry.raw); } catch { warnings.push("В архиве есть исходные строки, которые не читаются как JSON. Они сохранены без исправлений; восстановление потребует проверки."); break; }
        }
      }
      const comparison: BackupInspection["comparison"] = { same: 0, new: 0, different: 0, currentOnly: 0, schema: 0, differences: [] };
      const difference = (kind: BackupDifferenceKind, area: string, id: string) => {
        if (kind === "current-only") comparison.currentOnly++; else comparison[kind]++;
        comparison.differences.push({ kind, area, id });
      };
      command.onProgress?.("Сравниваем сохранённые записи…");
      const before = capturePortalStorage(dependencies.storage); const current = new Map(before.map((entry) => [entry.key, entry.raw]));
      for (const entry of archive.localStorage) {
        if (!current.has(entry.key)) difference("new", "Локальные данные", entry.key);
        else if (current.get(entry.key) !== entry.raw) difference("different", "Локальные данные", entry.key);
        else comparison.same++;
        current.delete(entry.key);
      }
      for (const key of current.keys()) difference("current-only", "Локальные данные", key);
      const available = await dependencies.listDatabases(); const budget = createBackupBudget();
      for (const source of BACKUP_DATABASES) {
        checkBackupAbort(command.signal);
        command.onProgress?.(`Сравниваем вложения: ${BACKUP_DATABASES.indexOf(source) + 1} из ${BACKUP_DATABASES.length}…`);
        const archived = archive.databases.find((database) => database.name === source.name)!;
        const live = available.some((database) => database.name === source.name) ? await dependencies.readDatabase(source.name, source.store, command.signal) : { name: source.name, version: null, stores: [] };
        if (archived.version !== live.version) difference("schema", areaNames[source.name], "Версия или наличие базы данных отличаются");
        const archiveStores = new Map(archived.stores.map((store) => [store.name, store]));
        for (const store of live.stores) {
          const archivedStore = archiveStores.get(store.name); archiveStores.delete(store.name);
          const area = `${areaNames[source.name]} · ${store.name}`;
          if (!archivedStore || schemaKey(store) !== schemaKey(archivedStore)) difference("schema", area, "Структура хранилища отличается");
          const archiveRecords = new Map((archivedStore?.records ?? []).map((record) => [canonicalBackupValue(record.key), record]));
          for (const record of store.records) {
            if (++budget.records > BACKUP_LIMITS.records) throw new Error("Текущие файловые хранилища превышают лимит сравнения 25 000 записей.");
            if (budget.records % 128 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(command.signal); }
            const key = await encodeBackupValue(record.key, budget, command.signal);
            const encodedKey = canonicalBackupValue(key); const original = archiveRecords.get(encodedKey); archiveRecords.delete(encodedKey);
            if (!original) difference("current-only", area, recordLabel(key));
            else {
              const value = await encodeBackupValue(record.value, budget, command.signal);
              if (canonicalBackupValue(value) === canonicalBackupValue(original.value)) comparison.same++;
              else difference("different", area, recordLabel(key));
            }
          }
          for (const record of archiveRecords.values()) difference("new", area, recordLabel(record.key));
        }
        for (const store of archiveStores.values()) {
          const area = `${areaNames[source.name]} · ${store.name}`;
          difference("schema", area, "Хранилище есть только в архиве");
          for (const record of store.records) difference("new", area, recordLabel(record.key));
        }
      }
      const latest = await dependencies.listDatabases(); checkBackupAbort(command.signal); dependencies.authorize(command);
      if (JSON.stringify(before) !== JSON.stringify(capturePortalStorage(dependencies.storage)) || BACKUP_DATABASES.some(({ name }) => available.find((item) => item.name === name)?.version !== latest.find((item) => item.name === name)?.version)) throw new Error("Текущие данные изменились во время сравнения. Завершите редактирование в других вкладках и повторите проверку.");
      return { filename: command.file.name, source: archive.source, completedAt: archive.completedAt, inspectedAt: new Date().toISOString(), sha256, totals: archive.totals, warnings, documents, comparison };
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось проверить резервную копию портала:", error);
      throw error;
    }
  },
});
export const backupInspectionService = { inspect: (command: BackupInspectionCommand) => createBackupInspectionService(createBrowserBackupDependencies()).inspect(command) };
