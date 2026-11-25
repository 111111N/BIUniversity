import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";

async function inspectPublicationSources(document: ManagedScheduleSnapshot, sources: { accountIds?: Set<string>; groupIds?: Set<string>; subjectIds?: Set<string> }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const { issues, add } = createBackupIssueCollector("базовым зависимостям публикаций расписания"), work = createBackupInspectionWork("сверки публикаций расписания", signal);
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => add({ kind: "schedule", ...value });
  await work.step(0); work.assertRecords(document.publications?.length ?? 0);
  let copies = 0;
  for (const publication of document.publications ?? []) {
    await work.step();
    if (!sources.accountIds) issue({ level: "review", code: "unchecked-publication-author", recordId: publication.id, referenceId: publication.actorId, message: "Автор сохранения версии не подтверждён: учётные записи отсутствуют в архиве." });
    else if (!sources.accountIds.has(publication.actorId)) issue({ level: "error", code: "missing-publication-author", recordId: publication.id, referenceId: publication.actorId, message: "В архиве отсутствует учётная запись автора сохранения версии расписания." });
    if (!sources.groupIds?.has(publication.week.groupId)) issue({ level: "review", code: "unresolved-publication-group", recordId: publication.id, referenceId: publication.week.groupId, message: "Группа архивной публикации не подтверждена сохранённым справочником. Встроенные группы не подставлялись." });
    if (Date.parse(publication.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "publication-after-backup", recordId: publication.id, message: "Версия расписания сохранена после завершения архива." });
    if (publication.origin === "saved-snapshot") issue({ level: "review", code: "publication-baseline", recordId: publication.id, message: "Это снимок прежнего сохранённого расписания при включении архива версий. Время фиксации и её автор не подтверждают раннюю историю публикаций." });
    for (const lesson of publication.week.lessons) {
      work.assertRecords(++copies); await work.step();
      if (!sources.accountIds) issue({ level: "review", code: "unchecked-publication-teacher", referenceId: lesson.teacherId, message: "Преподаватель архивной пары не подтверждён: источник учёток отсутствует." });
      else if (!sources.accountIds.has(lesson.teacherId)) issue({ level: "error", code: "missing-publication-teacher", recordId: publication.id, referenceId: lesson.teacherId, message: "Учётная запись преподавателя архивной пары отсутствует в архиве." });
      if (!sources.subjectIds) issue({ level: "review", code: "unchecked-publication-subject", referenceId: lesson.subjectId, message: "Дисциплина архивной пары не подтверждена: её справочник отсутствует." });
      else if (!sources.subjectIds.has(lesson.subjectId)) issue({ level: "error", code: "missing-publication-subject", recordId: publication.id, referenceId: lesson.subjectId, message: "Дисциплина архивной пары отсутствует в сохранённом справочнике." });
    }
  }
  if (document.publications?.length) issue({ level: "review", code: "publication-archive-selection", message: "Исторические полномочия публикации, выбор связанных версий и согласование архива публикаций с выбранным расписанием требуют отдельной итоговой проверки. Восстановление всего архива не разрешено." });
  if (document.publications?.length && !Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-publication-cutoff", message: "Время завершения архива не подтверждено для проверки версий расписания." });
  checkBackupAbort(signal); return issues;
}

export async function inspectArchivedSchedulePublications(...args: Parameters<typeof inspectPublicationSources>) {
  try { return await inspectPublicationSources(...args); }
  catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить базовые зависимости публикаций расписания:", error);
    throw error;
  }
}
