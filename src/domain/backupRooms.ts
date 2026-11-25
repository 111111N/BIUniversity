import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import type { ManagedLesson, ManagedScheduleSnapshot } from "./scheduleManagement";
import type { RoomsDocument } from "./rooms";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import { isCanonicalBackupInstant } from "./backupHistoryTime";

async function inspectRoomSources(document: RoomsDocument | undefined, sources: { accountIds?: Set<string>; schedule?: ManagedScheduleSnapshot }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const { issues, add } = createBackupIssueCollector("базовым зависимостям аудиторий"), work = createBackupInspectionWork("сверки аудиторий", signal), step = work.step;
  const versions = new Map<string, RoomsDocument["history"][number]>();
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => add({ kind: "rooms", ...value });
  await step(0); work.assertRecords(document?.history.length ?? 0);
  for (const event of document?.history ?? []) {
    await step(); const key = JSON.stringify([event.after.id, event.after.revision]); work.addText(key); versions.set(key, event);
    if (!sources.accountIds) issue({ level: "review", code: "unchecked-room-author", referenceId: event.actorId, message: "Автор изменения аудитории не проверен: учётки отсутствуют или повреждены в архиве." });
    else if (!sources.accountIds.has(event.actorId)) issue({ level: "error", code: "missing-room-author", recordId: event.id, referenceId: event.actorId, message: "Автор изменения аудитории отсутствует в архиве." });
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "room-event-after-backup", recordId: event.id, message: "Аудитория изменена после завершения резервной копии." });
  }
  let copies = 0;
  const checkLesson = async (lesson: ManagedLesson, cutoff?: string) => {
    work.assertRecords(++copies); await step();
    if (!lesson.roomId) return;
    const event = versions.get(JSON.stringify([lesson.roomId, lesson.roomRevision]));
    if (!document) issue({ level: "error", code: "missing-rooms-document", referenceId: lesson.roomId, message: "Расписание ссылается на карточки аудиторий, но их справочник отсутствует или повреждён в архиве." });
    else if (!event) issue({ level: "error", code: "missing-room-version", recordId: lesson.id, referenceId: lesson.roomId, message: "Версия аудитории из занятия отсутствует в сохранённой истории справочника." });
    else if (event.after.status !== "active" || event.after.name !== lesson.room || event.after.building !== lesson.roomBuilding) issue({ level: "error", code: "mismatched-room-snapshot", recordId: lesson.id, referenceId: lesson.roomId, message: "Название, корпус или состояние аудитории не соответствуют указанной версии карточки." });
    else if (cutoff && !isCanonicalBackupInstant(cutoff)) issue({ level: "review", code: "unconfirmed-room-snapshot-instant", recordId: lesson.id, referenceId: event.id, message: "Время старого снимка расписания не подтверждает канонический момент. Версия аудитории не сравнивалась с условной полуночью." });
    else if (cutoff && Date.parse(event.occurredAt) > Date.parse(cutoff)) issue({ level: "error", code: "room-version-after-lesson", recordId: lesson.id, referenceId: event.id, message: "Занятие ссылается на изменение аудитории, сделанное позже сохранения этого снимка расписания." });
  };
  for (const rows of [sources.schedule?.drafts ?? [], sources.schedule?.published ?? [], sources.schedule?.journal ?? [], sources.schedule?.publications ?? []]) work.assertRecords(rows.length);
  for (const week of sources.schedule?.drafts ?? []) { await step(); for (const lesson of week.lessons) await checkLesson(lesson, week.updatedAt); }
  for (const week of sources.schedule?.published ?? []) { await step(); for (const lesson of week.lessons) await checkLesson(lesson, week.publishedAt); }
  for (const entry of sources.schedule?.journal ?? []) await checkLesson(entry);
  for (const publication of sources.schedule?.publications ?? []) { await step(); for (const lesson of publication.week.lessons) await checkLesson(lesson, publication.week.publishedAt ?? publication.occurredAt); }
  if (document?.history.length) {
    issue({ level: "review", code: "unchecked-room-history-authority", message: "Исторические полномочия авторов и совместный выбор версий справочника аудиторий с расписанием требуют отдельной проверки G03. Документы не применялись." });
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-rooms-cutoff", message: "Время завершения архива не подтверждено для истории аудиторий." });
  }
  checkBackupAbort(signal);
  const { inspectArchivedRoomPublicationHistory } = await import("./backupRoomPublicationHistory");
  for (const finding of (await inspectArchivedRoomPublicationHistory(document, sources.schedule, completedAt, signal)).issues) issue(finding);
  checkBackupAbort(signal); return issues;
}

export async function inspectArchivedRooms(...args: Parameters<typeof inspectRoomSources>) {
  try { return await inspectRoomSources(...args); }
  catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить базовые зависимости аудиторий:", error);
    throw error;
  }
}
