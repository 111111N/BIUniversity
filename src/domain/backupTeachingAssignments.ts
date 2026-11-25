import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import type { TeachingAssignmentsDocument } from "./teachingAssignments";
import type { ManagedLesson, ManagedScheduleSnapshot } from "./scheduleManagement";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";

async function inspectTeachingSources(document: TeachingAssignmentsDocument, sources: { accountIds?: Set<string>; groupIds?: Set<string>; subjectIds?: Set<string>; periods?: AcademicPeriodsDocument; schedule?: ManagedScheduleSnapshot }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const { issues, add } = createBackupIssueCollector("базовым зависимостям назначений преподавателей"), work = createBackupInspectionWork("сверки назначений преподавателей", signal);
  const issue = (item: Omit<BackupDocumentIssue, "kind">) => add({ kind: "teachingAssignments", ...item });
  await work.step(0);
  work.assertRecords(document.history.length); work.assertRecords(sources.periods?.history.length ?? 0);
  await work.step(sources.periods?.history.length ?? 0);
  const lookup = sources.periods && createAssessmentPeriodHistoryLookup(sources.periods);
  const versions = new Map<string, TeachingAssignmentsDocument["history"][number]["after"]>();
  for (const event of document.history) {
    await work.step(); const key = JSON.stringify([event.after.id, event.after.revision]);
    work.addText(key); versions.set(key, event.after);
    for (const [label, id] of [["author", event.actorId], ["teacher", event.after.teacherId]]) {
      if (!sources.accountIds) issue({ level: "review", code: `unchecked-teaching-${label}`, recordId: event.id, referenceId: id, message: "Учётная запись назначения не проверена: источник отсутствует в архиве." });
      else if (!sources.accountIds.has(id)) issue({ level: "error", code: `missing-teaching-${label}`, recordId: event.id, referenceId: id, message: "В архиве отсутствует учётная запись автора или назначенного преподавателя." });
    }
    if (!sources.groupIds?.has(event.after.groupId)) issue({ level: "review", code: "unresolved-teaching-group", recordId: event.after.id, referenceId: event.after.groupId, message: "Группа назначения не подтверждена сохранённым справочником; встроенные данные не подставлялись." });
    if (!sources.subjectIds) issue({ level: "review", code: "unchecked-teaching-subject", recordId: event.after.id, referenceId: event.after.subjectId, message: "Справочник дисциплин отсутствует в архиве." });
    else if (!sources.subjectIds.has(event.after.subjectId)) issue({ level: "error", code: "missing-teaching-subject", recordId: event.after.id, referenceId: event.after.subjectId, message: "Дисциплина назначения отсутствует в архиве." });
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "teaching-event-after-backup", recordId: event.id, message: "Назначение изменено позже завершения архива." });
    for (const entry of event.after.periods) {
      await work.step();
      if (!lookup) issue({ level: "review", code: "unchecked-teaching-period", recordId: event.id, referenceId: entry.period.term.id, message: "Снимок семестра назначения не проверен: источник отсутствует в архиве." });
      else if (!lookup(entry.period, event.occurredAt)) issue({ level: "error", code: "inconsistent-teaching-period", recordId: event.id, referenceId: entry.period.term.id, message: "Снимок семестра назначения не соответствует его истории в архиве." });
    }
  }
  let copies = 0;
  const checkLessons = async (lessons: readonly ManagedLesson[]) => {
    work.assertRecords(lessons.length);
    for (const lesson of lessons) {
      work.assertRecords(++copies); await work.step();
      if (!lesson.teachingAssignmentId) continue;
      const assignment = versions.get(JSON.stringify([lesson.teachingAssignmentId, lesson.teachingAssignmentRevision]));
      if (!assignment || assignment.teacherId !== lesson.teacherId || assignment.subjectId !== lesson.subjectId || assignment.groupId !== lesson.groupId) issue({ level: "error", code: "missing-published-teaching-version", recordId: lesson.id, referenceId: lesson.teachingAssignmentId, message: "Сохранённая версия назначения опубликованного занятия отсутствует или относится к другой учебной области." });
      else if (assignment.mode === "periods") {
        let covered = false;
        for (const entry of assignment.periods) {
          await work.step();
          if (entry.types.includes(lesson.type) && entry.period.term.startsOn <= lesson.date && entry.period.term.endsOn >= lesson.date) { covered = true; break; }
        }
        if (!covered) issue({ level: "error", code: "published-teaching-outside-scope", recordId: lesson.id, referenceId: assignment.id, message: "Тип или дата опубликованного занятия не входят в сохранённую версию назначения." });
      }
    }
  };
  work.assertRecords(sources.schedule?.published.length ?? 0); work.assertRecords(sources.schedule?.publications?.length ?? 0);
  for (const week of sources.schedule?.published ?? []) { await work.step(); await checkLessons(week.lessons); }
  await checkLessons(sources.schedule?.journal ?? []);
  for (const version of sources.schedule?.publications ?? []) { await work.step(); await checkLessons(version.week.lessons); }
  if (document.history.length) {
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-teaching-cutoff", message: "Время завершения архива не подтверждено." });
    issue({ level: "review", code: "unconfirmed-teaching-authority", message: "Исторические полномочия, общие назначения учёток и ссылки расписания на выбранные версии назначений требуют итоговой проверки. Схема не разрешает восстановление." });
  }
  checkBackupAbort(signal); return issues;
}

export async function inspectArchivedTeachingAssignments(...args: Parameters<typeof inspectTeachingSources>) {
  try { return await inspectTeachingSources(...args); }
  catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить базовые зависимости назначений преподавателей:", error);
    throw error;
  }
}
