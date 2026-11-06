import { decodeAccountsDocument } from "./accounts";
import { BACKUP_NOTIFICATION_DOCUMENTS, decodeBackupNotifications } from "./backupNotificationDocuments";
import { isLocalNotificationHref } from "./localNotificationHref";
import { BACKUP_LIMITS, checkBackupAbort } from "./localBackup";
import { assertCompleteBackupRecordComparison, BackupRecordDecodeError, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const FIELDS = ["recipientUserId", "userId", "recipientRole", "kind", "title", "body", "href", "createdAt", "read", "dedupeKey"] as const;
export type NotificationComparedField = typeof FIELDS[number] | "other";
export type BackupNotificationComparison = BackupRecordComparison<NotificationComparedField>;
const document = BACKUP_NOTIFICATION_DOCUMENTS.notifications, accountKey = "bi-university-accounts-v1";
const recipientOf = (row: Record<string, unknown>) => typeof row.recipientUserId === "string" ? row.recipientUserId : typeof row.userId === "string" ? row.userId : undefined;
const definition: BackupRecordDefinition<NotificationComparedField> = {
  collection: "notifications", label: "Уведомления", fields: FIELDS,
  matchesKey: key => key.startsWith(document.prefix), supportsKey: key => key === document.key,
  decode: raw => {
    const rows = decodeBackupNotifications(raw);
    if (rows.some(row => row.recipientRole !== undefined && !["student", "teacher"].includes(row.recipientRole as string))) throw new Error("Сохранённая роль получателя уведомления не соответствует поддерживаемой схеме.");
    if (rows.some(row => typeof row.id !== "string" || !row.id.trim() || !recipientOf(row)?.trim()
      || (row.recipientUserId !== undefined && row.userId !== undefined && row.recipientUserId !== row.userId))) throw new BackupRecordDecodeError("unresolved-notification-source");
    if (rows.some(row => typeof row.href === "string" && !isLocalNotificationHref(row.href))) throw new Error("Сохранённая ссылка уведомления не соответствует допустимому внутреннему адресу.");
    return rows;
  },
};
const indexRecipients = async (entries: BackupRecordEntries, signal?: AbortSignal) => {
  const accountSources: string[] = []; let bytes = 0, notifications = false;
  for (let i = 0; i < entries.length; i++) {
    if (i % 128 === 0) { await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); }
    const entry = entries[i];
    if (entry.key !== accountKey && !definition.matchesKey(entry.key)) continue;
    bytes += (entry.key.length + entry.raw.length) * 2;
    if (bytes > BACKUP_LIMITS.textBytes) throw new Error("Источники уведомлений и получателей превышают лимит 16 МиБ. Частичный результат не создан.");
    if (entry.key === accountKey) accountSources.push(entry.raw); else notifications = true;
  }
  if (!notifications || accountSources.length !== 1) return undefined;
  try { return new Set(decodeAccountsDocument(accountSources[0]).accounts.map(row => row.id)); }
  catch { return undefined; }
};

/** Never infer recipient IDs from roles or borrow the other source's account catalog. */
export const compareBackupNotificationRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupNotificationComparison> => {
  const recipients = { archive: await indexRecipients(archive, signal), browser: await indexRecipients(browser, signal) };
  return compareBackupRecords(archive, browser, {
    ...definition,
    decode: (raw, key, source) => {
      const rows = definition.decode(raw, key, source) as Record<string, unknown>[];
      if (rows.some(row => !recipients[source]?.has(recipientOf(row)!))) throw new BackupRecordDecodeError("unresolved-notification-source");
      return rows;
    },
  }, signal);
};
export const assertCompleteNotificationComparison = (review: BackupNotificationComparison) => assertCompleteBackupRecordComparison(review, definition);
export const getNotificationBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => collection === definition.collection ? definition : undefined;
