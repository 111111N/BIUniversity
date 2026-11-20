import type { ScheduleTemplatesDocument } from "./scheduleTemplates";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { checkBackupAbort } from "./localBackup";
export async function inspectArchivedScheduleTemplates(document: ScheduleTemplatesDocument, sources: { accountIds?: Set<string>; schedule?: ManagedScheduleSnapshot }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>(), publications = new Map(sources.schedule?.publications?.map(row => [row.id, row]));
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => { const key = JSON.stringify([value.code, value.recordId, value.referenceId]); if (!seen.has(key)) { seen.add(key); issues.push({ kind: "scheduleTemplates", ...value }); } };
  let count = 0;
  for (const event of document.history) {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    if (!sources.accountIds) issue({ level: "review", code: "unchecked-template-author", referenceId: event.actorId, message: "Автор шаблона не проверен: учётные записи отсутствуют в архиве." });
    else if (!sources.accountIds.has(event.actorId)) issue({ level: "error", code: "missing-template-author", recordId: event.id, referenceId: event.actorId, message: "Автор изменения шаблона отсутствует в архиве." });
    const publication = publications.get(event.after.publicationId);
    if (!sources.schedule) issue({ level: "review", code: "unchecked-template-publication", referenceId: event.after.publicationId, message: "Источник шаблона не проверен: расписание отсутствует или повреждено в архиве." });
    else if (!publication) issue({ level: "error", code: "missing-template-publication", recordId: event.after.id, referenceId: event.after.publicationId, message: "Архивная публикация, на которую ссылается шаблон, отсутствует в сохранённом расписании." });
    else if (!publication.week.lessons.length || publication.occurredAt > event.occurredAt) issue({ level: "error", code: "invalid-template-publication", recordId: event.after.id, referenceId: publication.id, message: "Источник шаблона пуст или зафиксирован позже создания/изменения шаблона." });
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "template-event-after-backup", recordId: event.id, message: "Шаблон изменён после завершения архива." });
  }
  if (document.history.length) {
    issue({ level: "review", code: "unconfirmed-template-authority", message: "Исторические полномочия и совместный выбор шаблонов с версиями публикаций требуют отдельной проверки G03. Схема не разрешает восстановление." });
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-template-cutoff", message: "Время завершения архива не подтверждено для проверки шаблонов." });
  }
  return issues;
}
