import type { MessagingState, StoredMessage } from "../data/messageStore";
import { isUserRole } from "./accounts";
import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";
import { inspectArchivedMessageDelivery, type ArchivedAttachmentPair, type ArchivedMessageMailbox } from "./backupMessageDelivery";
import { inspectArchivedReplyChains } from "./backupReplyChains";
import { inspectArchivedMessageAttachments, type ArchivedMessageAttachmentReference } from "./backupMessageAttachments";

const PREFIX = "bi-university-messages-";
const DATABASE = `${PREFIX}v3`;
const MAILBOX = `${PREFIX}v2:`;
export const BACKUP_MESSAGING_DOCUMENTS = { messaging: { key: DATABASE, prefix: PREFIX, label: "Переписка" } } as const;
export const isBackupMessagingKey = (key: string) => key.startsWith(PREFIX);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonblank = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonblank);
const duplicates = (values: readonly unknown[]) => new Set(values).size !== values.length;
const unread = (value: unknown) => value === undefined || (record(value) && ["students", "teachers", "groups"].every((tab) => value[tab] === undefined || (Number.isSafeInteger(value[tab]) && (value[tab] as number) >= 0)));
const ownerOf = (key: string) => {
  if (!key.startsWith(MAILBOX)) return;
  const suffix = key.slice(MAILBOX.length); const separator = suffix.indexOf(":");
  if (separator < 1 || !isUserRole(suffix.slice(0, separator))) return;
  try {
    const id = decodeURIComponent(suffix.slice(separator + 1));
    if (nonblank(id) && `${MAILBOX}${suffix.slice(0, separator)}:${encodeURIComponent(id)}` === key) return id;
  } catch { /* A malformed encoded ID must not become a different mailbox. */ }
};
const message = (value: unknown): value is StoredMessage => {
  if (!record(value)) return false;
  const attachments = value.attachments;
  return finite(value.id) && typeof value.incoming === "boolean" && typeof value.text === "string" && typeof value.time === "string"
    && (attachments === undefined || (Array.isArray(attachments) && attachments.length <= 5 && attachments.every((file: unknown) => record(file)
      && nonblank(file.id) && typeof file.name === "string" && typeof file.type === "string" && finite(file.size) && file.size >= 0)))
    && Boolean(value.text.trim() || (Array.isArray(attachments) && attachments.length))
    && (value.replyTo === undefined || finite(value.replyTo))
    && (value.deliveryId === undefined || nonblank(value.deliveryId))
    && (value.sentAt === undefined || (typeof value.sentAt === "string" && Number.isFinite(Date.parse(value.sentAt))));
};

/** Read all archive generations independently. Never resolve demo users, deliver messages or merge mailboxes. */
export const inspectBackupMessaging = async (entries: AdministrativeBackup["localStorage"], accountIds?: ReadonlySet<string>, signal?: AbortSignal, databases?: AdministrativeBackup["databases"]) => {
  const issues: BackupDocumentIssue[] = [];
  const attachmentReferences: ArchivedMessageAttachmentReference[] = [];
  const currentMailboxes = new Map<string, ArchivedMessageMailbox>();
  let documents = 0; let invalid = 0; let records = 0; let index = 0;
  const step = async () => { if (++index % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const finding = (level: "error" | "review", code: string, key: string, message: string, recordId?: string) => issues.push({ kind: "messaging", level, code, referenceId: key, recordId, message });
  const owner = (key: string, mailbox: string, id: string) => {
    if (!accountIds) finding("review", "unchecked-message-owner", key, "Владелец переписки не проверен: учётки отсутствуют или не читаются в архиве. Данные браузера не подставлялись.", mailbox);
    else if (!accountIds.has(id)) finding("error", "missing-message-owner", key, "В архиве нет учётной записи владельца переписки. Сообщения не переданы другому пользователю.", mailbox);
  };
  const inspectState = async (value: unknown, key: string, mailbox: string) => {
    const fail = () => finding("error", "invalid-message-state", key, "Не читается структура диалогов, сообщений, вложений, счётчиков или бесед. Записи не нормализованы и не отброшены.", mailbox);
    if (!record(value) || !strings(value.dialogIds) || !record(value.messages)
      || (value.leftGroupIds !== undefined && !strings(value.leftGroupIds))
      || !unread(value.unread)
      || (value.groups !== undefined && (!Array.isArray(value.groups) || !value.groups.every((group: unknown) => record(group) && nonblank(group.id) && nonblank(group.name) && strings(group.memberIds) && finite(group.createdAt))))) {
      fail(); return false;
    }
    for (const [dialog, rows] of Object.entries(value.messages)) {
      await step();
      if (!dialog.trim() || !Array.isArray(rows)) { fail(); return false; }
      const ids = new Set<number>();
      for (const row of rows) {
        await step();
        if (!message(row) || ids.has(row.id)) { fail(); return false; }
        ids.add(row.id);
      }
    }
    const state = value as unknown as MessagingState;
    const groups = new Set(state.groups?.map((group) => group.id));
    if (duplicates(state.dialogIds) || duplicates(state.leftGroupIds ?? []) || duplicates((state.groups ?? []).map((group) => group.id))) finding("error", "duplicate-message-identifiers", key, "Повторяются ID диалогов, бесед или выходов из бесед. Записи не объединялись.", mailbox);
    for (const group of state.groups ?? []) {
      await step();
      const id = JSON.stringify([mailbox, group.id]);
      if (duplicates(group.memberIds)) finding("error", "duplicate-message-members", key, "В беседе повторяются ID участников. Состав не изменён.", id);
      if (!accountIds || group.memberIds.some((member) => !accountIds.has(member))) finding("review", "unchecked-message-members", key, "Не все участники беседы подтверждены учётками архива. Возможны встроенные профили; состав и права требуют отдельной проверки.", id);
    }
    const dialogs = new Set([...state.dialogIds, ...Object.keys(state.messages)]);
    const listed = new Set(state.dialogIds);
    for (const dialog of dialogs) {
      await step();
      const id = JSON.stringify([mailbox, dialog]);
      if (!groups.has(dialog) && (!accountIds || !accountIds.has(dialog))) finding("review", "unchecked-message-contact", key, "Контакт не подтверждён учётками или беседами архива. Встроенные профили и беседы не подставлялись; принадлежность требует проверки.", id);
      if (!listed.has(dialog)) finding("review", "unlisted-message-dialog", key, "У сохранённых сообщений нет диалога в списке. Доступность переписки нужно проверить; список не дополнен автоматически.", id);
      const rows = Object.hasOwn(state.messages, dialog) ? state.messages[dialog] : []; records += rows.length;
      const ownerId = ownerOf(mailbox);
      const role = mailbox.slice(MAILBOX.length, mailbox.indexOf(":", MAILBOX.length));
      const expectedScope = ownerId === undefined ? undefined : `${role}:${encodeURIComponent(ownerId)}:${encodeURIComponent(dialog)}`;
      const ids = new Set(rows.map((row) => row.id)); const deliveries = new Set<string>();
      for (const row of rows) {
        await step();
        const rowId = JSON.stringify([mailbox, dialog, row.id]);
        if (row.replyTo !== undefined && (!ids.has(row.replyTo) || row.replyTo === row.id)) finding("review", "unchecked-message-reply", key, "Исходное сообщение ответа не найдено в этом диалоге или ссылка ведёт на сам ответ. Возможное удаление и историю нужно проверить; ссылка не изменена.", rowId);
        if (row.deliveryId !== undefined && deliveries.has(row.deliveryId)) finding("error", "duplicate-message-delivery", key, "В одном диалоге повторяется ID доставки. Сообщения не объединялись и повторно не отправлялись.", rowId);
        if (row.deliveryId !== undefined) deliveries.add(row.deliveryId);
        if (duplicates(row.attachments?.map((file) => file.id) ?? [])) finding("error", "duplicate-message-attachments", key, "В сообщении повторяются ID вложений. Файлы не читались и не удалялись.", rowId);
        if (databases !== undefined) for (const attachment of row.attachments ?? []) attachmentReferences.push({ key, mailbox, dialog, messageId: row.id, expectedScope, attachment });
      }
      for (const chain of await inspectArchivedReplyChains(rows, signal)) finding(chain.level, chain.code, key, chain.message, JSON.stringify([mailbox, dialog, chain.id]));
    }
    return true;
  };
  for (const entry of entries) {
    await step(); if (!isBackupMessagingKey(entry.key)) continue;
    documents++;
    let parsed: unknown;
    try { parsed = JSON.parse(entry.raw); }
    catch { invalid++; finding("error", "invalid-messaging-json", entry.key, "Некорректный JSON переписки. Исходный текст не включён в отчёт."); continue; }
    if (entry.key === DATABASE) {
      if (!record(parsed) || parsed.version !== 1 || !record(parsed.users)) {
        invalid++; finding("error", "invalid-messaging-database", entry.key, "Не поддерживается версия или структура общего документа переписки. Старые копии не подставлялись."); continue;
      }
      let valid = true;
      for (const [mailbox, state] of Object.entries(parsed.users)) {
        await step(); const id = ownerOf(mailbox);
        if (id === undefined) { valid = false; finding("error", "unsupported-message-mailbox", entry.key, "Ключ почтового ящика не задаёт поддерживаемый тип и однозначный ID владельца. Переписка не переименована.", mailbox); continue; }
        owner(entry.key, mailbox, id);
        const readable = await inspectState(state, entry.key, mailbox);
        currentMailboxes.set(mailbox, { ownerId: id, ...(readable ? { state: state as MessagingState } : {}) });
        if (!readable) valid = false;
      }
      if (!valid) invalid++;
    } else {
      const id = ownerOf(entry.key);
      const legacy = entry.key.startsWith(`${PREFIX}v1:`) && isUserRole(entry.key.slice(`${PREFIX}v1:`.length));
      if (id === undefined && !legacy) { invalid++; finding("error", "unsupported-messaging-key", entry.key, "Найдена неподдерживаемая версия или неоднозначный ключ переписки. Другой ящик не выбирался."); continue; }
      if (id !== undefined) owner(entry.key, entry.key, id);
      else finding("review", "legacy-message-owner", entry.key, "В старой переписке владелец задан только типом учётки. Демонстрационный пользователь не подставлялся; принадлежность требует отдельной проверки.");
      if (!await inspectState(parsed, entry.key, entry.key)) invalid++;
    }
  }
  const attachmentPairs: ArchivedAttachmentPair[] = [];
  const delivery = await inspectArchivedMessageDelivery(currentMailboxes, accountIds, signal, databases === undefined ? undefined : (pair) => { attachmentPairs.push(pair); });
  for (const issue of delivery.issues) issues.push(issue);
  const attachments = databases === undefined ? undefined : await inspectArchivedMessageAttachments(attachmentReferences, databases, signal, attachmentPairs);
  if (attachments) for (const issue of attachments.issues) issues.push(issue);
  checkBackupAbort(signal);
  const checks: BackupDocumentCheck[] = [{ kind: "messaging", key: DATABASE, label: BACKUP_MESSAGING_DOCUMENTS.messaging.label, documents,
    status: !documents ? "absent" : invalid ? "invalid" : "valid", ...(documents && !invalid ? { records } : {}),
    message: (!documents ? "Сохранённой переписки нет в архиве. Примеры диалогов не подставляются."
      : `Документов: ${documents}; прочитано: ${documents - invalid}; не читается: ${invalid}. Сообщения посчитаны по всем сохранённым копиям без объединения. Сопоставлено пар личных сообщений в общем документе: ${delivery.comparedPairs}. Сверяются только однозначные ID доставки и владельцы из архива; отсутствие второй копии не доказывает сбой отправки. Ссылки ответов сопоставляются по ID доставки сохранённых исходных сообщений. Цепочки проверяются на циклы и расхождения дат. История перенумерации и права участников ещё не проверены.`)
      + (attachments ? ` ${attachments.summary}` : " Файловые записи не переданы этой проверке; наличие и принадлежность вложений не проверены."),
  }];
  return { checks, issues };
};
