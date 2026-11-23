import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, type AdministrativeBackup } from "./localBackup";
import { createBackupIssueCollector } from "./backupIssueCollector";
import type { BackupDocumentKind } from "./localBackupDocuments";

export const BACKUP_FILE_RECORD_FIELDS = {
  material: ["id", "blob", "name", "type", "size", "createdAt", "scope", "category", "uploadedBy", "description", "pinned"],
  message: ["id", "blob", "name", "type", "size", "scope"],
} as const;
const DEFINITIONS = [
  { database: "bi-university-cabinet", store: "teacher-files", kind: "materials", fields: BACKUP_FILE_RECORD_FIELDS.material },
  { database: "bi-university-message-files", store: "attachments", kind: "messaging", fields: BACKUP_FILE_RECORD_FIELDS.message },
  { database: "bi-university-learning-files", store: "files", kind: "assignments", fields: undefined },
] as const;

/** The outer archive decoder validates tagged values, not the application schema of each stored object. */
export async function inspectArchivedFileSchemaCoverage(databases: AdministrativeBackup["databases"], signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("полноте файловых схем"), budget = createBackupBudget();
  const summaries: { kind: BackupDocumentKind; message: string }[] = [];
  let operations = 0, records = 0;
  const step = async () => {
    if (++operations > BACKUP_LIMITS.nodes) throw new Error("Проверка полноты файловых схем превышает предел операций. Частичный результат не создан.");
    if (operations % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  try {
    checkBackupAbort(signal);
    if (databases.length > BACKUP_LIMITS.records) throw new Error("Список файловых баз превышает предел проверки. Частичный результат не создан.");
    for (const database of databases) {
      await step(); addBackupText(budget, database.name);
      const definition = DEFINITIONS.find(item => item.database === database.name);
      if (!definition) throw new Error("Неизвестная файловая база не может получить полную проверку схемы. Проверьте исходный архив заново.");
      if (database.stores.length > BACKUP_LIMITS.records) throw new Error("Список файловых хранилищ превышает предел проверки. Частичный результат не создан.");
      let uncheckedStores = 0, uncheckedRecords = 0;
      const fields: ReadonlySet<string> | undefined = definition.fields ? new Set(definition.fields) : undefined;
      for (const [storeIndex, store] of database.stores.entries()) {
        await step(); addBackupText(budget, store.name);
        records += store.records.length;
        if (records > BACKUP_LIMITS.records) throw new Error("Файловых записей больше 25 000. Полная проверка схемы не создана.");
        if (store.name !== definition.store) {
          uncheckedStores++;
          add({ kind: definition.kind, level: "review", code: "unchecked-file-store", referenceId: definition.database, recordId: JSON.stringify(["store", storeIndex]), message: "В файловой базе есть дополнительное хранилище без поддерживаемой прикладной схемы. Даже пустое хранилище требует проверки совместимости; записи не пропускались как разрешённые к восстановлению и не удалялись." });
          continue;
        }
        if (!fields) continue; // Learning files store a tagged Blob directly; its fields are checked by the outer decoder.
        for (const [recordIndex, record] of store.records.entries()) {
          await step();
          if (record.value.type !== "object") continue; // The existing record inspector reports an incompatible value.
          let unknown = false;
          for (const [field] of record.value.entries) {
            await step(); addBackupText(budget, field);
            if (!fields.has(field)) unknown = true;
          }
          if (!unknown) continue;
          uncheckedRecords++;
          add({ kind: definition.kind, level: "review", code: "unchecked-file-record-fields", referenceId: `${definition.database}/${definition.store}`, recordId: JSON.stringify(["row", recordIndex + 1]), message: "У файловой записи есть поля вне поддерживаемой прикладной схемы. Проверка известных метаданных и связей не подтверждает эти поля; имена и значения дополнительных полей не раскрыты, не удалены и не исправлены." });
        }
      }
      if (database.version !== null) summaries.push({ kind: definition.kind, message: `Полнота файловой схемы: дополнительных хранилищ без подтверждённой схемы ${uncheckedStores}; записей с неподдерживаемыми полями ${uncheckedRecords}. Это проверка покрытия схемы, а не владельцев, прав или разрешение записи.` });
    }
    checkBackupAbort(signal);
    return { issues, summaries };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось полностью проверить прикладные схемы файловых хранилищ архива:", error);
    throw error;
  }
}
