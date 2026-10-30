import { checkBackupAbort, type AdministrativeBackup, type BackupValue } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";
import { resolveJournalTeachingArea, type ArchivedJournalCatalogs } from "./journalTeachingArea";
import { inspectArchivedFileIndexes } from "./backupFileIndexes";

export const BACKUP_MATERIAL_DOCUMENTS = { materials: { key: "bi-university-cabinet/teacher-files", label: "Материалы" } } as const;
interface MaterialSources extends ArchivedJournalCatalogs { accountIds?: ReadonlySet<string> }
const string = (node?: BackupValue) => node?.type === "string" ? node.value : undefined;
const number = (node?: BackupValue) => node?.type === "number" ? node.value : undefined;

/** Read tagged records and declared scopes only; never upgrade a database or infer owners from names. */
export const inspectArchivedMaterials = async (databases: AdministrativeBackup["databases"], sources: MaterialSources, signal?: AbortSignal) => {
  const definition = BACKUP_MATERIAL_DOCUMENTS.materials; const issues: BackupDocumentIssue[] = [];
  const database = databases.find((item) => item.name === "bi-university-cabinet");
  const store = database?.stores.find((item) => item.name === "teacher-files");
  const unchecked = new Set<string>(); let count = 0; let invalid = 0; let read = 0; let matchedScopes = 0; let unresolvedScopes = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string) => issues.push({ kind: "materials", level, code, message, referenceId: definition.key, recordId });
  const uncheckedSource = (target: "accounts" | "subjects" | "catalogs") => {
    if (unchecked.has(target)) return; unchecked.add(target);
    finding("review", `unchecked-material-${target}`, "Часть областей материалов не проверена: нужный документ учёток, дисциплин или групп отсутствует либо не читается в архиве. Справочники браузера, встроенные записи и имена не подставлялись.");
  };
  const check = (status: BackupDocumentCheck["status"], message: string, records?: number): BackupDocumentCheck => ({ kind: "materials", key: definition.key, label: definition.label, status, message, ...(records === undefined ? {} : { records }) });
  checkBackupAbort(signal);
  if (!database || database.version === null) return { checks: [check("absent", "Хранилище материалов отсутствует в архиве. Файлы браузера не подставлялись.")], issues };
  const scopeIndex = store?.indexes.find((index) => index.name === "scope");
  const validIndex = scopeIndex?.keyPath === "scope" && !scopeIndex.unique && !scopeIndex.multiEntry;
  if (![1, 2].includes(database.version) || !store || store.keyPath !== "id" || store.autoIncrement || (scopeIndex && !validIndex) || (database.version === 2 && !validIndex)) {
    finding("error", "unsupported-materials-store", "Версия или схема хранилища материалов не поддерживается: проверьте ключ и индекс области. Файлы, владельцы и ссылки не преобразовывались.");
    return { checks: [check("invalid", "Схема хранилища материалов не поддерживается; записи и их связи не проверены.")], issues };
  }
  if (database.version === 1) finding("review", "legacy-materials-store", "Прочитано старое хранилище материалов версии 1. Совместимость будущего восстановления и обновления до текущей схемы требует проверки; обновление не выполнялось.");
  if (store.indexes.some((index) => index.name !== "scope")) finding("review", "unchecked-material-indexes", "У материалов есть дополнительные индексы. Их ограничения и совместимость будущих записей требуют отдельной проверки.");
  const indexReview = await inspectArchivedFileIndexes(store.records, store.indexes.filter((index) => index.name !== "scope"), signal);
  for (const issue of indexReview.issues) finding(issue.level, issue.code, issue.message, issue.recordId);
  for (const [index, entry] of store.records.entries()) {
    await step(); const key = string(entry.key); const recordId = key === undefined ? `row:${index + 1}` : key;
    const fields = entry.value.type === "object" ? new Map(entry.value.entries) : new Map<string, BackupValue>();
    const id = string(fields.get("id")); const name = string(fields.get("name")); const type = string(fields.get("type")); const size = number(fields.get("size"));
    const createdAt = number(fields.get("createdAt")); const blob = fields.get("blob"); const scope = string(fields.get("scope"));
    const optionalStrings = ["category", "uploadedBy", "description", "scope"].every((field) => !fields.has(field) || fields.get(field)?.type === "undefined" || fields.get(field)?.type === "string");
    const pinned = fields.get("pinned");
    if (!key?.trim() || id !== key || name === undefined || type === undefined || size === undefined || !Number.isSafeInteger(size) || size < 0
      || createdAt === undefined || !Number.isFinite(new Date(createdAt).getTime()) || blob?.type !== "blob" || !optionalStrings
      || (pinned !== undefined && pinned.type !== "undefined" && pinned.type !== "boolean")) {
      invalid++; finding("error", "invalid-material-record", "Не читается запись материала: проверьте ключ, ID, метаданные, дату и бинарное значение. Исходные поля не включены в отчёт и не исправлены.", recordId); continue;
    }
    read++;
    if (size !== blob.size || type !== blob.mediaType || (blob.file !== undefined && name !== blob.file.name)) finding("error", "material-blob-mismatch", "Метаданные материала расходятся с размером, типом или именем сохранённого бинарного значения. Имена и содержимое не включены в отчёт; файл не заменялся.", recordId);
    if (scope === undefined || !scope || scope === "cabinet") {
      unresolvedScopes++; finding("review", "legacy-material-owner", "У старого общего материала не сохранён ID владельца. Файл сохранён без изменений; владелец не назначался автоматически при проверке архива.", recordId); continue;
    }
    if (scope.startsWith("user:")) {
      let owner: string | undefined;
      try { const decoded = decodeURIComponent(scope.slice(5)); if (decoded.trim() && `user:${encodeURIComponent(decoded)}` === scope) owner = decoded; } catch { /* Malformed or noncanonical scope must stay unassigned. */ }
      if (owner === undefined) { unresolvedScopes++; finding("review", "invalid-material-scope", "Личная область материала не содержит однозначно закодированный ID. Область не нормализована, владелец не подобран.", recordId); }
      else if (!sources.accountIds) { unresolvedScopes++; uncheckedSource("accounts"); }
      else if (!sources.accountIds.has(owner)) { unresolvedScopes++; finding("review", "missing-material-owner", "В архиве нет учётки с ID владельца личного материала. Имя загрузившего не использовалось для замены владельца; файл не передавался другому человеку.", recordId); }
      else matchedScopes++;
    } else if (scope.startsWith("subject:") && scope.slice(8).trim()) {
      if (!sources.subjectIds) { unresolvedScopes++; uncheckedSource("subjects"); }
      else if (!sources.subjectIds.has(scope.slice(8))) { unresolvedScopes++; finding("review", "missing-material-subject", "Дисциплина области материала не найдена в каталоге архива. Соответствие требует проверки; название не использовалось для подбора.", recordId); }
      else matchedScopes++;
    } else if (scope.startsWith("group:")) {
      const area = await resolveJournalTeachingArea(scope.slice(6), sources, signal);
      if (area.status === "matched") matchedScopes++;
      else { unresolvedScopes++; if (area.status === "unavailable") uncheckedSource("catalogs");
        else finding("review", `${area.status}-material-area`, "Область материала не удалось однозначно связать с парой ID дисциплины и группы из архивных каталогов. Разделитель, названия и текущие назначения не использовались для подбора.", recordId);
      }
    } else { unresolvedScopes++; finding("review", "unsupported-material-scope", "Область материала не соответствует поддерживаемым личным или учебным областям. Файл не перемещался и область не переименовывалась.", recordId); }
  }
  checkBackupAbort(signal);
  return { issues, checks: [check(invalid ? "invalid" : "valid", `Записей материалов: ${store.records.length}; прочитано: ${read}; не читается: ${invalid}. Областей с найденными ID архива: ${matchedScopes}; не подтверждено: ${unresolvedScopes}. Метаданные сверяются с сохранённым бинарным значением без открытия файла. Наличие ID не подтверждает права участников; имя загрузившего не является ID автора. Файлы и области не изменялись.${indexReview.summary ? ` ${indexReview.summary}` : ""}`, store.records.length)] };
};
