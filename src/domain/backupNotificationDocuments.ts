import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";
import { isLocalNotificationHref } from "./localNotificationHref";
import { createArchivedNotificationTargetCheck, type ArchivedNotificationTargets } from "./backupNotificationTargets";

export const BACKUP_NOTIFICATION_DOCUMENTS = { notifications: { key: "bi-university-demo-notifications", prefix: "bi-university-demo-notifications", label: "Уведомления" } } as const;
export const isBackupNotificationKey = (key: string) => key.startsWith(BACKUP_NOTIFICATION_DOCUMENTS.notifications.prefix);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const optionalText = (row: Record<string, unknown>, keys: string[]) => keys.every((key) => row[key] === undefined || typeof row[key] === "string");
const hasRecipient = (row: Record<string, unknown>) => row.recipientUserId !== undefined ? nonempty(row.recipientUserId)
  : row.userId !== undefined ? nonempty(row.userId) : row.recipientRole === "teacher" || row.recipientRole === "student";

const decodeNotifications = (raw: string) => {
  const parsed: unknown = JSON.parse(raw);
  const current = isRecord(parsed) && parsed.version === 2;
  const rows: unknown = Array.isArray(parsed) ? parsed : isRecord(parsed) && [undefined, 1, 2].includes(parsed.version as number | undefined) ? parsed.items : undefined;
  if (!Array.isArray(rows) || !rows.every((row: unknown) => isRecord(row)
    && ["assignment", "submission", "grade", "revision", "schedule"].includes(row.kind as string)
    && nonempty(row.title) && typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt))
    && optionalText(row, ["id", "recipientUserId", "userId", "body", "href", "dedupeKey"])
    && (row.read === undefined || typeof row.read === "boolean")
    && hasRecipient(row)
    && (!current || (nonempty(row.id) && nonempty(row.recipientUserId) && typeof row.body === "string" && typeof row.href === "string" && typeof row.read === "boolean")))) {
    throw new Error("Не читается схема уведомлений: проверьте версию, ID, получателя, тип, дату и поля записи. Данные не исправлялись.");
  }
  const ids = new Set<string>(); const dedupeKeys = new Set<string>();
  for (const row of rows as Record<string, unknown>[]) {
    if (nonempty(row.id)) {
      const id = row.id.trim();
      if (ids.has(id)) throw new Error("В уведомлениях повторяются ID. Записи не объединялись и не удалялись.");
      ids.add(id);
    }
    const recipient = nonempty(row.recipientUserId) ? row.recipientUserId.trim() : nonempty(row.userId) ? row.userId.trim() : undefined;
    if (recipient && nonempty(row.dedupeKey)) {
      // Match the reader's persisted composite index without silently merging colliding rows.
      const key = `${recipient}:${row.dedupeKey.trim()}`;
      if (dedupeKeys.has(key)) throw new Error("Ключи уведомлений дают повторяющийся индекс при текущем чтении. Записи не объединялись и не удалялись.");
      dedupeKeys.add(key);
    }
  }
  return rows as Record<string, unknown>[];
};

/** Validate archived notifications without generating IDs, assigning legacy roles or sanitizing saved links. */
export const inspectBackupNotifications = async (entries: AdministrativeBackup["localStorage"], accountIds?: ReadonlySet<string>, signal?: AbortSignal, targetSources?: ArchivedNotificationTargets) => {
  const issues: BackupDocumentIssue[] = [];
  const targets = await createArchivedNotificationTargetCheck(targetSources, signal);
  let documents = 0; let invalid = 0; let records = 0; let index = 0;
  const definition = BACKUP_NOTIFICATION_DOCUMENTS.notifications;
  for (const entry of entries) {
    if (++index % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    if (!isBackupNotificationKey(entry.key)) continue;
    documents++;
    if (entry.key !== definition.key) {
      invalid++;
      issues.push({ kind: "notifications", level: "error", code: "unsupported-notification-key", referenceId: entry.key, message: "Ключ уведомлений не поддерживается текущей версией. Он не заменяет известный список уведомлений." });
      continue;
    }
    let rows: Record<string, unknown>[];
    try { rows = decodeNotifications(entry.raw); }
    catch (error) {
      invalid++;
      issues.push({ kind: "notifications", level: "error", code: "invalid-notification-document", referenceId: entry.key,
        message: error instanceof SyntaxError ? "Некорректный JSON уведомлений. Исходный текст не включён в отчёт." : error instanceof Error ? error.message : "Не удалось проверить список уведомлений.",
      });
      continue;
    }
    records += rows.length;
    for (const [rowIndex, row] of rows.entries()) {
      if (rowIndex % 128 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); }
      const recordId = nonempty(row.id) ? row.id : undefined;
      const finding = (level: "error" | "review", code: string, message: string) => issues.push({
        kind: "notifications", level, code: recordId ? code : `${code}-row-${rowIndex + 1}`, referenceId: entry.key, recordId,
        message: recordId ? message : `Запись №${rowIndex + 1}: ${message}`,
      });
      if (!recordId) finding("review", "legacy-notification-id", "У старого уведомления нет постоянного ID. Идентификатор не создавался; перед восстановлением нужна проверка совместимости.");
      const recipient = nonempty(row.recipientUserId) ? row.recipientUserId.trim() : nonempty(row.userId) ? row.userId.trim() : undefined;
      if (!recipient) finding("review", "legacy-notification-recipient", "Уведомление адресовано роли без ID получателя. Учётная запись не выбиралась автоматически; требуется отдельная проверка принадлежности.");
      else if (!accountIds) finding("review", "unchecked-notification-recipient", "Получатель не проверен: учётные записи отсутствуют или не читаются в архиве. Данные браузера не подставлялись.");
      else if (!accountIds.has(recipient)) finding("error", "missing-notification-recipient", "В архиве нет учётной записи получателя уведомления. Запись не передана другому пользователю.");
      if (nonempty(row.recipientUserId) && nonempty(row.userId) && row.recipientUserId.trim() !== row.userId.trim()) finding("error", "notification-recipient-conflict", "Сохранённые поля получателя указывают разные ID. Значения не заменены и не объединены.");
      if (typeof row.href !== "string") finding("review", "legacy-notification-link", "У старого уведомления не сохранена ссылка. Адрес для перехода не подставлялся.");
      else if (!isLocalNotificationHref(row.href.trim())) finding("error", "invalid-notification-link", "Ссылка уведомления не соответствует допустимому внутреннему адресу. Она не открывалась и не заменялась; исходный адрес не включён в отчёт.");
      else targets.inspect(row.href.trim(), finding);
    }
  }
  checkBackupAbort(signal);
  const checks: BackupDocumentCheck[] = [{ kind: "notifications", key: definition.key, label: definition.label, documents,
    status: !documents ? "absent" : invalid ? "invalid" : "valid", ...(documents && !invalid ? { records } : {}),
    message: !documents ? "Сохранённых уведомлений нет в архиве. Встроенные примеры не подставляются."
      : `Списков: ${documents}; прочитано: ${documents - invalid}; не читается: ${invalid}. ${targets.summary()}`,
  }];
  return { checks, issues };
};
