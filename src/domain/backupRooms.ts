import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import type { ManagedLesson, ManagedScheduleSnapshot } from "./scheduleManagement";
import type { RoomsDocument } from "./rooms";

export async function inspectArchivedRooms(document: RoomsDocument | undefined, sources: { accountIds?: Set<string>; schedule?: ManagedScheduleSnapshot }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>(), versions = new Map(document?.history.map(event => [JSON.stringify([event.after.id, event.after.revision]), event]));
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => { const key = JSON.stringify([value.code, value.recordId, value.referenceId]); if (!seen.has(key)) { seen.add(key); issues.push({ kind: "rooms", ...value }); } };
  let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const event of document?.history ?? []) {
    await step();
    if (!sources.accountIds) issue({ level: "review", code: "unchecked-room-author", referenceId: event.actorId, message: "Автор изменения аудитории не проверен: учётки отсутствуют или повреждены в архиве." });
    else if (!sources.accountIds.has(event.actorId)) issue({ level: "error", code: "missing-room-author", recordId: event.id, referenceId: event.actorId, message: "Автор изменения аудитории отсутствует в архиве." });
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "room-event-after-backup", recordId: event.id, message: "Аудитория изменена после завершения резервной копии." });
  }
  const checkLesson = async (lesson: ManagedLesson, cutoff?: string) => {
    await step();
    if (!lesson.roomId) return;
    const event = versions.get(JSON.stringify([lesson.roomId, lesson.roomRevision]));
    if (!document) issue({ level: "error", code: "missing-rooms-document", referenceId: lesson.roomId, message: "Расписание ссылается на карточки аудиторий, но их справочник отсутствует или повреждён в архиве." });
    else if (!event) issue({ level: "error", code: "missing-room-version", recordId: lesson.id, referenceId: lesson.roomId, message: "Версия аудитории из занятия отсутствует в сохранённой истории справочника." });
    else if (event.after.status !== "active" || event.after.name !== lesson.room || event.after.building !== lesson.roomBuilding) issue({ level: "error", code: "mismatched-room-snapshot", recordId: lesson.id, referenceId: lesson.roomId, message: "Название, корпус или состояние аудитории не соответствуют указанной версии карточки." });
    else if (cutoff && Date.parse(event.occurredAt) > Date.parse(cutoff)) issue({ level: "error", code: "room-version-after-lesson", recordId: lesson.id, referenceId: event.id, message: "Занятие ссылается на изменение аудитории, сделанное позже сохранения этого снимка расписания." });
  };
  for (const week of sources.schedule?.drafts ?? []) for (const lesson of week.lessons) await checkLesson(lesson, week.updatedAt);
  for (const week of sources.schedule?.published ?? []) for (const lesson of week.lessons) await checkLesson(lesson, week.publishedAt);
  for (const entry of sources.schedule?.journal ?? []) await checkLesson(entry);
  for (const publication of sources.schedule?.publications ?? []) for (const lesson of publication.week.lessons) await checkLesson(lesson, publication.week.publishedAt ?? publication.occurredAt);
  if (document?.history.length) {
    issue({ level: "review", code: "unchecked-room-history-authority", message: "Исторические полномочия авторов и совместный выбор версий справочника аудиторий с расписанием требуют отдельной проверки G03. Документы не применялись." });
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-rooms-cutoff", message: "Время завершения архива не подтверждено для истории аудиторий." });
  }
  checkBackupAbort(signal); return issues;
}
