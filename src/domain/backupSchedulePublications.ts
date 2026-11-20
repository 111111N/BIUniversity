import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

export async function inspectArchivedSchedulePublications(document: ManagedScheduleSnapshot, sources: { accountIds?: Set<string>; groupIds?: Set<string>; subjectIds?: Set<string> }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>();
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => { const key = JSON.stringify([value.code, value.recordId, value.referenceId]); if (!seen.has(key)) { seen.add(key); issues.push({ kind: "schedule", ...value }); } };
  let count = 0;
  for (const publication of document.publications ?? []) {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    if (!sources.accountIds) issue({ level: "review", code: "unchecked-publication-author", recordId: publication.id, referenceId: publication.actorId, message: "Автор сохранения версии не подтверждён: учётные записи отсутствуют в архиве." });
    else if (!sources.accountIds.has(publication.actorId)) issue({ level: "error", code: "missing-publication-author", recordId: publication.id, referenceId: publication.actorId, message: "В архиве отсутствует учётная запись автора сохранения версии расписания." });
    if (!sources.groupIds?.has(publication.week.groupId)) issue({ level: "review", code: "unresolved-publication-group", recordId: publication.id, referenceId: publication.week.groupId, message: "Группа архивной публикации не подтверждена сохранённым справочником. Встроенные группы не подставлялись." });
    if (Date.parse(publication.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "publication-after-backup", recordId: publication.id, message: "Версия расписания сохранена после завершения архива." });
    if (publication.origin === "saved-snapshot") issue({ level: "review", code: "publication-baseline", recordId: publication.id, message: "Это снимок прежнего сохранённого расписания при включении архива версий. Время фиксации и её автор не подтверждают раннюю историю публикаций." });
    for (const lesson of publication.week.lessons) {
      if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
      if (!sources.accountIds) issue({ level: "review", code: "unchecked-publication-teacher", referenceId: lesson.teacherId, message: "Преподаватель архивной пары не подтверждён: источник учёток отсутствует." });
      else if (!sources.accountIds.has(lesson.teacherId)) issue({ level: "error", code: "missing-publication-teacher", recordId: publication.id, referenceId: lesson.teacherId, message: "Учётная запись преподавателя архивной пары отсутствует в архиве." });
      if (!sources.subjectIds) issue({ level: "review", code: "unchecked-publication-subject", referenceId: lesson.subjectId, message: "Дисциплина архивной пары не подтверждена: её справочник отсутствует." });
      else if (!sources.subjectIds.has(lesson.subjectId)) issue({ level: "error", code: "missing-publication-subject", recordId: publication.id, referenceId: lesson.subjectId, message: "Дисциплина архивной пары отсутствует в сохранённом справочнике." });
    }
  }
  if (document.publications?.length) issue({ level: "review", code: "publication-archive-selection", message: "Исторические полномочия публикации, выбор связанных версий и согласование архива публикаций с выбранным расписанием требуют отдельной итоговой проверки. Восстановление всего архива не разрешено." });
  if (document.publications?.length && !Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-publication-cutoff", message: "Время завершения архива не подтверждено для проверки версий расписания." });
  return issues;
}
