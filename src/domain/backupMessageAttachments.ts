import type { MessageAttachment } from "../data/messageStore";
import { checkBackupAbort, type AdministrativeBackup, type BackupValue } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import type { ArchivedAttachmentPair } from "./backupMessageDelivery";
import { inspectArchivedFileIndexes } from "./backupFileIndexes";

export interface ArchivedMessageAttachmentReference {
  key: string; mailbox: string; dialog: string; messageId: number; expectedScope?: string; attachment: MessageAttachment;
}
const DATABASE = "bi-university-message-files";
const STORE = `${DATABASE}/attachments`;
const string = (node?: BackupValue) => node?.type === "string" ? node.value : undefined;
const number = (node?: BackupValue) => node?.type === "number" ? node.value : undefined;
type ArchivedBlob = Extract<BackupValue, { type: "blob" }>;
interface FileRecord { id: string; scope: string; name: string; type: string; size: number; blob: ArchivedBlob; consistent: boolean }
const referenceToken = (key: string, mailbox: string, dialog: string, messageId: number, fileId: string) => JSON.stringify([key, mailbox, dialog, messageId, fileId]);

/** Read validated tagged archive values only. Never decode a Blob or consult IndexedDB. */
export const inspectArchivedMessageAttachments = async (references: readonly ArchivedMessageAttachmentReference[], databases: AdministrativeBackup["databases"], signal?: AbortSignal, pairs: readonly ArchivedAttachmentPair[] = []) => {
  const issues: BackupDocumentIssue[] = [];
  const files = new Map<string, FileRecord | null>(); let count = 0;
  const validReferences = new Map<string, FileRecord>();
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const finding = (level: "error" | "review", code: string, message: string, referenceId: string, recordId?: string) => issues.push({ kind: "messaging", level, code, message, referenceId, recordId });
  checkBackupAbort(signal);
  const database = databases.find((item) => item.name === DATABASE);
  const store = database?.stores.find((item) => item.name === "attachments");
  if (database && database.version !== null && (database.version !== 1 || !store || store.keyPath !== "id" || store.autoIncrement)) {
    finding("error", "unsupported-message-files-store", "Версия или схема хранилища вложений переписки не поддерживается текущим форматом. Связи с файлами не подтверждены; данные не преобразовывались.", STORE);
    return { issues, summary: "Схема файлового хранилища не поддерживается; ссылки вложений не проверены." };
  }
  if (store?.indexes.length) finding("review", "unchecked-message-files-indexes", "У хранилища вложений есть дополнительные индексы. Их ограничения и совместимость будущих записей требуют отдельной проверки.", STORE);
  const indexReview = await inspectArchivedFileIndexes(store?.records ?? [], store?.indexes ?? [], signal);
  for (const issue of indexReview.issues) finding(issue.level, issue.code, issue.message, STORE, issue.recordId);
  let unreferenced = 0;
  const referenced = new Set(references.map((reference) => reference.attachment.id));
  for (const [index, entry] of (store?.records ?? []).entries()) {
    await step();
    const key = string(entry.key); const recordId = key === undefined ? `row:${index + 1}` : JSON.stringify(["file", key]);
    if (key === undefined || !referenced.has(key)) unreferenced++;
    const fields = entry.value.type === "object" ? new Map(entry.value.entries) : new Map<string, BackupValue>();
    const id = string(fields.get("id")); const scope = string(fields.get("scope"));
    const name = string(fields.get("name")); const type = string(fields.get("type")); const size = number(fields.get("size")); const blob = fields.get("blob");
    if (key !== undefined) files.set(key, null);
    if (!key?.trim() || id !== key || !scope?.trim() || name === undefined || type === undefined || size === undefined || !Number.isFinite(size) || size < 0 || blob?.type !== "blob") {
      finding("error", "invalid-message-file-record", "Не читается запись вложения: проверьте первичный ключ, ID, область владельца, метаданные и бинарное значение. Исходные поля не включены в отчёт и не исправлены.", STORE, recordId); continue;
    }
    const consistent = size === blob.size && type === blob.mediaType && (blob.file === undefined || name === blob.file.name);
    if (!consistent) {
      finding("error", "message-file-blob-mismatch", "Метаданные файловой записи расходятся с размером, типом или именем сохранённого бинарного значения. Значения не включены в отчёт; содержимое файла не открывалось.", STORE, recordId);
    }
    files.set(key, { id, scope, name, type, size, blob, consistent });
  }
  for (const reference of references) {
    await step();
    const recordId = JSON.stringify([reference.mailbox, reference.dialog, reference.messageId, reference.attachment.id]);
    const file = files.get(reference.attachment.id);
    if (file === undefined) {
      finding("error", "missing-message-attachment", "В сообщении есть ссылка на файл, которого нет в архивном хранилище вложений. Файл браузера или другой копии сообщения не подставлялся.", reference.key, recordId); continue;
    }
    if (file === null) continue; // The exact invalid file record already has an error, without guessing its fields.
    if (reference.expectedScope === undefined) finding("review", "unchecked-message-attachment-owner", "У старой переписки нет однозначного ID владельца. Принадлежность вложения ящику и диалогу не подтверждена; пользователь не выбран автоматически.", reference.key, recordId);
    else if (file.scope !== reference.expectedScope) finding("error", "message-attachment-scope-mismatch", "Область файла не совпадает с ящиком и диалогом сообщения. Доступ к файлу не подтверждён; область не изменена и файл не передан другому пользователю.", reference.key, recordId);
    const attachment = reference.attachment;
    if (file.name !== attachment.name || file.type !== attachment.type || file.size !== attachment.size) finding("error", "message-attachment-metadata-mismatch", "Метаданные вложения в сообщении расходятся с файловой записью. Имена, типы и размеры не включены в замечание; записи не исправлялись.", reference.key, recordId);
    else if (file.consistent && reference.expectedScope !== undefined && file.scope === reference.expectedScope) validReferences.set(referenceToken(reference.key, reference.mailbox, reference.dialog, reference.messageId, attachment.id), file);
  }
  let comparedPairs = 0;
  const contentCache = new Map<string, boolean>();
  const sameContent = async (left: ArchivedBlob, right: ArchivedBlob) => {
    checkBackupAbort(signal);
    if (left.size !== right.size || left.base64.length !== right.base64.length) return false;
    // Canonical Base64 has already been checked by archive validation; compare encoded bytes, not File metadata.
    const chunkSize = 262_144;
    for (let offset = 0; offset < left.base64.length; offset += chunkSize) {
      if (left.base64.length > chunkSize) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await step();
      if (left.base64.slice(offset, offset + chunkSize) !== right.base64.slice(offset, offset + chunkSize)) return false;
    }
    return true;
  };
  const source = "bi-university-messages-v3";
  for (const pair of pairs) {
    await step(); if (pair.own.attachments.length !== pair.peer.attachments.length) continue;
    for (let index = 0; index < pair.own.attachments.length; index++) {
      await step(); const own = pair.own.attachments[index]; const peer = pair.peer.attachments[index];
      if (own.name !== peer.name || own.type !== peer.type || own.size !== peer.size) continue;
      const left = validReferences.get(referenceToken(source, pair.own.mailbox, pair.own.dialog, pair.own.messageId, own.id));
      const right = validReferences.get(referenceToken(source, pair.peer.mailbox, pair.peer.dialog, pair.peer.messageId, peer.id));
      if (!left || !right) continue;
      const token = JSON.stringify([left.id, right.id].sort());
      let equal = contentCache.get(token);
      if (equal === undefined) { equal = await sameContent(left.blob, right.blob); contentCache.set(token, equal); }
      comparedPairs++;
      if (!equal) finding("error", "message-attachment-content-mismatch", "Содержимое копий вложения одного личного сообщения различается. Имена, содержимое и значения сравнения не включены в отчёт; файлы не заменялись.", source, JSON.stringify([pair.own.mailbox, pair.own.dialog, pair.own.messageId, own.id]));
    }
  }
  if (unreferenced) finding("review", "unreferenced-message-files", "Часть файлов не имеет ссылки из читаемой переписки архива. Возможны временные вложения и нечитаемые источники; это не основание для удаления файлов.", STORE);
  checkBackupAbort(signal);
  return { issues, summary: `Файловых записей: ${store?.records.length ?? 0}; ссылок из читаемых сообщений: ${references.length}; записей без такой ссылки: ${unreferenced}. Сопоставлено пар вложений по содержимому: ${comparedPairs}. Сверка содержимого выполняется только для однозначных копий личных сообщений с корректными ссылками, областями и метаданными. Права участников, подлинность файлов и полнота ссылок из нечитаемых документов не подтверждены.${indexReview.summary ? ` ${indexReview.summary}` : ""}` };
};
