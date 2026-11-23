import type { GroupCatalogDocument, GroupChange, GroupValues } from "./groupCatalog";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";

// Compare known saved values only. Missing creation snapshots are never reconstructed.
const values = (value: GroupValues, includeStatus = true) => JSON.stringify([
  value.name, value.course, value.campus ?? null, value.admissionYear ?? null,
  ...(includeStatus ? [value.status ?? "active"] : []),
]);

export async function inspectArchivedGroupHistory(document: GroupCatalogDocument | undefined, signal?: AbortSignal): Promise<{ issues: BackupDocumentIssue[]; summary: string }> {
  const issues: BackupDocumentIssue[] = [], budget = createBackupBudget();
  const byGroup = new Map<string, GroupChange[]>();
  let steps = 0, checked = 0, incomplete = 0;
  const step = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const issue = (level: BackupDocumentIssue["level"], code: string, message: string, groupId?: string, eventId?: string) => {
    if (issues.length >= BACKUP_LIMITS.records) throw new Error("Замечаний к истории групп больше 25 000. Частичный результат не создан.");
    const finding: BackupDocumentIssue = { kind: "groups", level, code, message, ...(groupId ? { referenceId: groupId } : {}), ...(eventId ? { recordId: eventId } : {}) };
    addBackupText(budget, JSON.stringify(finding)); issues.push(finding);
  };
  checkBackupAbort(signal);
  if (!document) return { issues, summary: "Снимки истории групп не проверены: полный источник отсутствует или не читается." };
  for (const event of document.history) {
    await step(); const rows = byGroup.get(event.groupId) ?? []; rows.push(event); byGroup.set(event.groupId, rows);
  }
  if (document.revision !== document.history.length) issue("review", "group-catalog-history-revision-gap", "Ревизия каталога не объясняется сохранённым числом событий. Полнота ранней истории не подтверждена; счётчик и события не исправлялись.");
  for (const group of document.groups) {
    await step(); const history = byGroup.get(group.id) ?? [];
    if (!history.length) {
      incomplete++;
      issue("review", "missing-group-history", "Для карточки группы не сохранены события. Её ранние значения и происхождение не восстанавливались из текущих реквизитов.", group.id);
      continue;
    }
    const first = history[0], last = history[history.length - 1];
    if (group.revision !== history.length) issue("review", "group-card-history-revision-gap", "Ревизия карточки не объясняется сохранённым числом событий группы. Полнота истории требует отдельного источника.", group.id);
    const anchored = first.action === "created" && group.source !== "initial" || first.action === "updated" && group.source === "initial";
    if (!anchored) {
      incomplete++;
      issue("review", "unconfirmed-group-history-start", "Начало истории не подтверждает создание или первую фиксацию этой карточки. Пропущенные события не достраивались.", group.id, first.id);
    } else if (Date.parse(group.createdAt) !== Date.parse(first.occurredAt) || group.createdBy !== first.actorId) {
      issue("error", "group-creation-anchor-mismatch", "Автор или момент фиксации карточки не совпадает с первым подтверждённым событием. Это не устанавливает реальную дату образования учебной группы.", group.id, first.id);
    }
    if (group.source === "initial") issue("review", "initial-group-history-baseline", "Карточка начата со снимка исходной группы. История до этой фиксации и ранний состав требуют независимого подтверждения.", group.id, first.id);
    let previous: GroupValues | undefined, previousTime = -Infinity;
    for (const [position, event] of history.entries()) {
      await step();
      const time = Date.parse(event.occurredAt);
      if (time < previousTime) issue("review", "group-history-time-order", "Сохранённый порядок событий расходится с их временем. Часы, порядок и события автоматически не исправлялись.", group.id, event.id);
      previousTime = time;
      if (event.action === "created") {
        if (position > 0) issue("error", "repeated-group-creation", "Для уже существующей группы повторно сохранено событие создания. ID и события не объединялись.", group.id, event.id);
        if (!event.after) {
          incomplete++;
          issue("review", "group-creation-without-values", "Событие создания не содержит исходных реквизитов. Из текущего названия и последующих событий они не выводились.", group.id, event.id);
        }
        if (event.before || event.after) issue("review", "unconfirmed-group-creation-payload", "Событие создания содержит снимки, происхождение которых не определено текущим форматом создания. Требуется подтверждение источника.", group.id, event.id);
        previous = event.after;
        continue;
      }
      if (!event.before || !event.after) {
        incomplete++;
        issue("review", "incomplete-group-change-values", "Для изменения нет обоих снимков реквизитов. Непроверенный участок истории не заменялся текущей карточкой.", group.id, event.id);
        previous = undefined; continue;
      }
      if (previous && values(previous) !== values(event.before)) issue("error", "group-history-before-mismatch", "Реквизиты до события не совпадают с сохранённым итогом предыдущего события группы. Цепочка снимков противоречива.", group.id, event.id);
      const beforeStatus = event.before.status ?? "active", afterStatus = event.after.status ?? "active";
      if (event.action === "updated") {
        if (beforeStatus !== afterStatus || values(event.before) === values(event.after)) issue("error", "group-update-values-mismatch", "Снимки изменения реквизитов меняют состояние архива либо не содержат изменения. Это не соответствует сохранённому виду действия.", group.id, event.id);
      } else {
        const archived = event.action === "archived";
        if (beforeStatus !== (archived ? "active" : "archived") || afterStatus !== (archived ? "archived" : "active") || values(event.before, false) !== values(event.after, false)) issue("error", "group-status-values-mismatch", "Снимки архивирования или восстановления противоречат переходу состояния либо одновременно меняют реквизиты. Записи не исправлялись.", group.id, event.id);
      }
      previous = event.after; checked++;
    }
    if (previous && values(previous) !== values(group)) issue("error", "group-current-values-mismatch", "Последний сохранённый снимок не совпадает с текущими реквизитами карточки группы.", group.id, last.id);
    if (last.action !== "created") {
      if (!group.updatedAt) issue("review", "missing-group-updated-time", "У карточки не сохранён момент последнего изменения. Он не подставлялся из истории.", group.id, last.id);
      else if (Date.parse(group.updatedAt) !== Date.parse(last.occurredAt)) issue("error", "group-updated-time-mismatch", "Момент последнего изменения карточки не совпадает с последним сохранённым событием группы.", group.id, last.id);
    }
  }
  checkBackupAbort(signal);
  return { issues, summary: `Проверено переходов со снимками групп: ${checked}. Участков без исходных значений или подтверждённого начала: ${incomplete}. Ранние реквизиты и состав не достраивались; роли авторов по текущим учёткам не выводились.` };
}
