import type { AccountChange, AccountsDocument, UserRole } from "./accounts";
import { resolveArchivedAccountHistory, type ArchivedAccountHistoryIndex } from "./backupAccountHistory";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import { checkBackupAbort } from "./localBackup";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { inspectArchivedPublicationMemberships } from "./backupPublicationMemberships";
import { inspectArchivedPublicationAccess } from "./backupPublicationAccess";
import { inspectArchivedAdministrativeAccess } from "./backupAdministrativeAccess";
import type { ArchivedAuthorSources } from "./backupActorChronology";
import { isCanonicalBackupInstant } from "./backupHistoryTime";

/** Internal audit consistency only; a coherent role chain never grants historical authority. */
export async function inspectArchivedAccountRoleHistory(document: AccountsDocument, completedAt: string, signal?: AbortSignal, index?: ArchivedAccountHistoryIndex, schedule?: ManagedScheduleSnapshot, administrativeSources?: ArchivedAuthorSources) {
  const { issues, add } = createBackupIssueCollector("цепочкам ролей учёток"), work = createBackupInspectionWork("цепочек ролей учёток", signal);
  const finding = (level: "error" | "review", code: string, message: string, accountId: string, eventId?: string) => add({ kind: "accounts", level, code, message, referenceId: accountId, ...(eventId === undefined ? {} : { recordId: eventId }) });
  try {
    await work.step(0); work.assertRecords(document.accounts.length); work.assertRecords(document.history.length);
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff) || !isCanonicalBackupInstant(completedAt)) throw new Error("Не определена точная граница проверки цепочек ролей учёток.");
    const historyIndex = await resolveArchivedAccountHistory(document.history, signal, index), byAccount = new Map<string, AccountChange[]>();
    const accountIds = new Set<string>();
    for (const account of document.accounts) { await work.step(); work.addText(account.id); accountIds.add(account.id); }
    for (const event of document.history) {
      await work.step(); work.addText(JSON.stringify([event.accountId, event.id]));
      const rows = byAccount.get(event.accountId) ?? []; rows.push(event); byAccount.set(event.accountId, rows);
      if (!accountIds.has(event.accountId)) finding("error", "missing-account-role-history-target", "История роли относится к учётке, отсутствующей в полном источнике. Другая учётка не подставлялась по имени.", event.accountId, event.id);
    }
    const coherentAccounts = new Set<string>();
    let anchored = 0, unconfirmed = 0, checked = 0, contradictions = 0, future = 0, uncertainDates = 0;
    for (const account of document.accounts) {
      await work.step(); const rows = byAccount.get(account.id) ?? [];
      if (!rows.length) { unconfirmed++; continue; }
      let creations = 0, unique = true, chronological = true, precise = true, previousTime = -Infinity;
      for (const event of rows) {
        await work.step(); const time = Date.parse(event.occurredAt);
        if (!Number.isFinite(time)) throw new Error("Аудит ролей содержит некорректное время. Частичный результат не создан.");
        if (event.action === "created") creations++;
        if (!isCanonicalBackupInstant(event.occurredAt)) precise = false;
        if (historyIndex.idCounts.get(event.id) !== 1) unique = false;
        if (time < previousTime) chronological = false;
        previousTime = time;
      }
      const first = rows[0], createdAt = Date.parse(account.createdAt ?? "");
      const anchoredSource = creations === 1 && first.action === "created" && first.previousRole === null && first.importBatchId === undefined && Number.isFinite(createdAt) && isCanonicalBackupInstant(account.createdAt ?? "") && createdAt === Date.parse(first.occurredAt) && unique && chronological && precise && account.revision === rows.length;
      const level = anchoredSource ? "error" : "review";
      if (!anchoredSource) finding("review", "unconfirmed-account-role-history-anchor", "Начало, точность времени, ревизия, уникальность или порядок аудита не подтверждают полную цепочку роли от создания учётки. Пропущенные события и начальная роль не достраивались.", account.id);
      let previousRole: UserRole | undefined, valid = true; previousTime = -Infinity;
      for (const [position, event] of rows.entries()) {
        await work.step(); checked++; const time = Date.parse(event.occurredAt);
        const exactTime = isCanonicalBackupInstant(event.occurredAt);
        if (!exactTime) {
          uncertainDates++; valid = false;
          finding("review", "unconfirmed-account-role-event-instant", "Старый формат даты не подтверждает канонический момент действия. Он не преобразовывался в точную полночь и не использован для строгой временной проверки прав.", account.id, event.id);
        }
        if (exactTime && time > cutoff) {
          future++; valid = false;
          finding("error", "account-role-event-after-backup", "Событие роли сохранено позже завершения архива. Его дата не исправлялась и не подтверждает прежние права.", account.id, event.id);
        }
        if (time < previousTime) {
          valid = false;
          finding("review", "account-role-history-time-order", "Время аудита роли расходится с сохранённым порядком. События не пересортировывались по датам или ID.", account.id, event.id);
        }
        previousTime = time;
        if (historyIndex.idCounts.get(event.id) !== 1) {
          valid = false; previousRole = undefined;
          finding("review", "ambiguous-account-role-audit-id", "ID записи аудита повторяется. Переход роли по неоднозначной записи не использован для соединения цепочки.", account.id, event.id);
          continue;
        }
        if (event.action === "created") {
          if (position > 0 || event.previousRole !== null) {
            valid = false; contradictions++;
            finding(level, "inconsistent-account-role-creation", "Событие создания стоит после другой истории учётки или содержит прежнюю роль. Новое начало цепочки не назначалось автоматически.", account.id, event.id);
          }
        } else {
          if (event.previousRole === null || previousRole !== undefined && event.previousRole !== previousRole) {
            valid = false; contradictions++;
            finding(level, "account-role-history-chain-mismatch", "Предыдущая роль события не соединяется с последней известной ролью сохранённой цепочки. Пропущенное изменение не достраивалось.", account.id, event.id);
          }
          if (event.action !== "role-changed" && event.previousRole !== null && event.previousRole !== event.nextRole) {
            valid = false; contradictions++;
            finding(level, "account-role-changed-by-other-action", "Событие другого типа меняет роль в своих снимках, хотя действующее действие сохраняет роль. Тип события и значения не переписывались.", account.id, event.id);
          }
        }
        previousRole = event.nextRole;
      }
      if (previousRole !== undefined && previousRole !== account.role) {
        valid = false; contradictions++;
        finding(level, "account-role-history-tail-mismatch", "Текущая роль учётки расходится с последней однозначно сохранённой ролью аудита. Текущая карточка не подменяет историю.", account.id, rows[rows.length - 1].id);
      }
      if (anchoredSource && valid) { anchored++; coherentAccounts.add(account.id); } else unconfirmed++;
    }
    const summary = `Цепочки ролей: согласованных от явного создания ${anchored}; неподтверждённых учёток ${unconfirmed}; просмотренных событий ${checked}; несовпадений переходов/карточек ${contradictions}; событий после границы ${future}; нестандартных дат ${uncertainDates}. Это внутренняя согласованность аудита, а не подтверждение полномочий.`;
    add({ kind: "accounts", level: "review", code: "unconfirmed-account-role-authority", message: `${summary} Статус входа, общие назначения и права конкретного исторического действия проверяются отдельно; текущая роль не даёт разрешения восстановления.` });
    const memberships = await inspectArchivedPublicationMemberships(document, schedule, { source: document, coherentAccounts, histories: byAccount }, completedAt, signal);
    for (const finding of memberships.issues) add(finding);
    const access = await inspectArchivedPublicationAccess(document, schedule, { source: document, coherentAccounts, histories: byAccount }, completedAt, signal);
    for (const finding of access.issues) add(finding);
    const administrative = administrativeSources && await inspectArchivedAdministrativeAccess(document, administrativeSources, { source: document, coherentAccounts, histories: byAccount }, completedAt, signal);
    for (const finding of administrative?.issues ?? []) add(finding);
    checkBackupAbort(signal);
    return { issues, summary: `${summary} ${memberships.summary} ${access.summary}${administrative ? ` ${administrative.summary}` : ""}` };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить сохранённые цепочки ролей учётных записей:", error);
    throw error;
  }
}
