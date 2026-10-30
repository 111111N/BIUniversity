import type { SavedAssignment, SavedSubmission } from "./assignmentStorage";
import { checkBackupAbort, type AdministrativeBackup, type BackupValue } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { inspectArchivedFileIndexes } from "./backupFileIndexes";

const DATABASE = "bi-university-learning-files";
const STORE = `${DATABASE}/files`;
const SOURCES = { assignments: "bi-university-demo-assignments", submissions: "bi-university-demo-submissions" };
type Kind = keyof typeof SOURCES;
type ArchivedBlob = Extract<BackupValue, { type: "blob" }>;
interface Attachment { attachmentId?: string; attachmentName?: string }
interface Reference { kind: Kind; fileId: string; name?: string; recordId: string; context: string }

/** Inspect tagged File/Blob records and every saved reference, without decoding bytes or inferring owners. */
export const inspectArchivedLearningAttachments = async (
  assignments: readonly SavedAssignment[] | undefined, submissions: readonly SavedSubmission[] | undefined,
  databases: AdministrativeBackup["databases"], signal?: AbortSignal,
) => {
  const issues: BackupDocumentIssue[] = []; const references: Reference[] = []; let count = 0;
  const stats = { assignments: { references: 0, found: 0, comparedNames: 0 }, submissions: { references: 0, found: 0, comparedNames: 0 } };
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const finding = (kind: Kind, level: "error" | "review", code: string, message: string, referenceId: string, recordId?: string) => issues.push({ kind, level, code, message, referenceId, recordId });
  const reference = (kind: Kind, attachment: Attachment, path: string[], context: string) => {
    if (attachment.attachmentId === undefined) {
      if (attachment.attachmentName?.trim()) finding(kind, "review", "learning-attachment-name-only", "Сохранено имя вложения без ID файла. Связь не подтверждена; файл по имени не подбирался.", SOURCES[kind], JSON.stringify(path));
      return;
    }
    stats[kind].references++;
    if (!attachment.attachmentId.trim()) {
      finding(kind, "review", "empty-learning-attachment-id", "Сохранён пустой ID вложения. Значение не заменено отсутствующим файлом или совпадением имени; связь требует проверки.", SOURCES[kind], JSON.stringify(path));
      return;
    }
    references.push({ kind, fileId: attachment.attachmentId, name: attachment.attachmentName, recordId: JSON.stringify([...path, attachment.attachmentId]), context });
  };
  for (const assignment of assignments ?? []) {
    await step(); reference("assignments", assignment, ["assignment", assignment.id], JSON.stringify(["assignment", assignment.id]));
  }
  for (const submission of submissions ?? []) {
    await step(); const context = JSON.stringify(["submission", submission.assignmentId, submission.studentId]);
    reference("submissions", submission, ["submission", submission.id, "current"], context);
    for (const attempt of submission.attempts ?? []) {
      await step(); reference("submissions", attempt, ["submission", submission.id, "attempt", attempt.id], context);
    }
  }
  const database = databases.find((item) => item.name === DATABASE); const store = database?.stores.find((item) => item.name === "files");
  const supported = !database || database.version === null || (database.version === 1 && store?.keyPath === null && store.autoIncrement === false);
  let unreferenced = 0; let indexSummary = "";
  const summaries = () => ({
    assignments: `Общее хранилище учебных файлов: записей ${store?.records.length ?? 0}; записей без ссылки из читаемых заданий и ответов ${supported ? unreferenced : "не проверено"}. ${summary("assignments")}${indexSummary ? ` ${indexSummary}` : ""}`,
    submissions: summary("submissions"),
  });
  const summary = (kind: Kind) => `Ссылок на учебные файлы из читаемых списков: ${stats[kind].references}; найдено файлов по ID: ${stats[kind].found}; сравнено имён: ${stats[kind].comparedNames}.`
    + (supported ? "" : " Схема файлового хранилища не поддерживается; связи не проверены.")
    + " В ответах отдельно учитываются карточка и каждая попытка. Имена сравниваются только при наличии в ссылке и File. В файловой записи нет владельца и учебной области: права и принадлежность не подтверждены.";
  if (!supported) {
    finding("assignments", "error", "unsupported-learning-files-store", "Версия или схема общего хранилища учебных файлов не поддерживается. Файлы и ссылки не преобразовывались; отсутствие файла по такой схеме не утверждается.", STORE);
    checkBackupAbort(signal); return { issues, summaries: summaries() };
  }
  if (store?.indexes.length) finding("assignments", "review", "unchecked-learning-files-indexes", "У общего хранилища учебных файлов есть дополнительные индексы. Их ограничения и совместимость будущих записей требуют отдельной проверки.", STORE);
  const indexReview = await inspectArchivedFileIndexes(store?.records ?? [], store?.indexes ?? [], signal); indexSummary = indexReview.summary;
  for (const issue of indexReview.issues) finding("assignments", issue.level, issue.code, issue.message, STORE, issue.recordId);
  const files = new Map<string, ArchivedBlob | null>(); const used = new Set(references.map((item) => item.fileId));
  for (const [index, entry] of (store?.records ?? []).entries()) {
    await step(); const id = entry.key.type === "string" ? entry.key.value : undefined;
    if (id === undefined || !used.has(id)) unreferenced++;
    if (id !== undefined) files.set(id, null);
    if (!id?.trim() || entry.value.type !== "blob") {
      finding("assignments", "error", "invalid-learning-file-record", "Не читается запись учебного файла: ожидаются непустой строковый ключ и сохранённый File/Blob. Исходные поля и содержимое не включены в отчёт и не исправлены.", STORE, id === undefined ? `row:${index + 1}` : JSON.stringify(["file", id]));
      continue;
    }
    files.set(id, entry.value);
  }
  const contexts = new Map<string, Set<string>>();
  for (const item of references) {
    await step(); const file = files.get(item.fileId);
    if (file === undefined) {
      finding(item.kind, "error", "missing-learning-attachment", "В задании, карточке ответа или попытке есть ссылка на файл, которого нет в архивном хранилище учебных файлов. Файл браузера, другой попытки или с совпадающим именем не подставлялся.", SOURCES[item.kind], item.recordId);
      continue;
    }
    if (file === null) continue;
    stats[item.kind].found++;
    if (file.file !== undefined && item.name !== undefined) {
      stats[item.kind].comparedNames++;
      if (file.file.name !== item.name) finding(item.kind, "error", "learning-attachment-name-mismatch", "Имя вложения в учебной записи не совпадает с именем сохранённого File. Имена не включены в замечание; ссылка и файл не исправлены.", SOURCES[item.kind], item.recordId);
    }
    let linkedContexts = contexts.get(item.fileId);
    if (!linkedContexts) { linkedContexts = new Set(); contexts.set(item.fileId, linkedContexts); }
    linkedContexts.add(item.context);
  }
  for (const [id, linkedContexts] of contexts) {
    await step();
    if (linkedContexts.size > 1) finding("assignments", "review", "shared-learning-attachment", "Один учебный файл связан с разными заданиями или ответами разных студентов. В файловой записи нет владельца: нужно проверить допустимость общего использования; файл не копировался и не передавался другому человеку.", STORE, JSON.stringify(["file", id]));
  }
  if (unreferenced) finding("assignments", "review", "unreferenced-learning-files", "Часть учебных файлов не имеет ссылки из читаемых заданий, карточек ответов и попыток архива. Возможны временные файлы и нечитаемые источники; это не основание для удаления.", STORE);
  checkBackupAbort(signal);
  return { issues, summaries: summaries() };
};
