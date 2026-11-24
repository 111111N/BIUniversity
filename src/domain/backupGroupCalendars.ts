import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { GroupCalendarsDocument } from "./groupCalendarTypes";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

export async function inspectArchivedGroupCalendars(document: GroupCalendarsDocument, sources: { accountIds?: Set<string>; groupIds?: Set<string>; periods?: AcademicPeriodsDocument }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>();
  const issue = (item: Omit<BackupDocumentIssue, "kind">) => { const key = JSON.stringify([item.code, item.referenceId, item.recordId]); if (!seen.has(key)) { seen.add(key); issues.push({ kind: "groupCalendars", ...item }); } };
  const lookup = sources.periods && createAssessmentPeriodHistoryLookup(sources.periods);
  let count = 0;
  for (const event of document.history) {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    if (!sources.accountIds) issue({ level: "review", code: "unchecked-calendar-author", recordId: event.id, referenceId: event.actorId, message: "Автор календаря или закрытия периода не проверен: учётные записи отсутствуют в архиве." });
    else if (!sources.accountIds.has(event.actorId)) issue({ level: "error", code: "missing-calendar-author", recordId: event.id, referenceId: event.actorId, message: "В архиве отсутствует учётная запись автора изменения календаря или состояния периода." });
    if (!sources.groupIds?.has(event.after.group.id)) issue({ level: "review", code: "unresolved-calendar-group", recordId: event.after.id, referenceId: event.after.group.id, message: "Группа календаря не подтверждена сохранённым справочником; встроенные группы не подставлялись." });
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "calendar-event-after-backup", recordId: event.id, message: "Изменение календаря датировано позже завершения архива." });
    if (!lookup) issue({ level: "review", code: "unchecked-calendar-period", recordId: event.id, referenceId: event.after.period.term.id, message: "Снимок семестра календаря не проверен: справочник периодов отсутствует." });
    else if (!lookup(event.after.period, event.occurredAt)) issue({ level: "error", code: "inconsistent-calendar-period", recordId: event.id, referenceId: event.after.period.term.id, message: "Снимок семестра календаря не соответствует истории периодов в архиве." });
  }
  if (document.history.length) {
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-calendar-cutoff", message: "Время завершения архива не подтверждено для проверки истории календаря." });
    issue({ level: "review", code: "unconfirmed-calendar-authority", message: "Исторические полномочия закрытия/переоткрытия, исторические реквизиты групп, ранние публикации без точного события и согласованность остальных учебных действий с состоянием периода требуют отдельной проверки. Восстановление не разрешено." });
  }
  return issues;
}
