import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import type { TeachingAssignmentsDocument } from "./teachingAssignments";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

export async function inspectArchivedTeachingAssignments(document: TeachingAssignmentsDocument, sources: { accountIds?: Set<string>; groupIds?: Set<string>; subjectIds?: Set<string>; periods?: AcademicPeriodsDocument; schedule?: ManagedScheduleSnapshot }, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>();
  const issue = (item: Omit<BackupDocumentIssue, "kind">) => { const key = JSON.stringify([item.code, item.referenceId, item.recordId]); if (!seen.has(key)) { seen.add(key); issues.push({ kind: "teachingAssignments", ...item }); } };
  const lookup = sources.periods && createAssessmentPeriodHistoryLookup(sources.periods);
  const versions = new Map(document.history.map(event => [JSON.stringify([event.after.id, event.after.revision]), event.after]));
  let count = 0;
  for (const event of document.history) {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    for (const [label, id] of [["author", event.actorId], ["teacher", event.after.teacherId]]) {
      if (!sources.accountIds) issue({ level: "review", code: `unchecked-teaching-${label}`, recordId: event.id, referenceId: id, message: "Учётная запись назначения не проверена: источник отсутствует в архиве." });
      else if (!sources.accountIds.has(id)) issue({ level: "error", code: `missing-teaching-${label}`, recordId: event.id, referenceId: id, message: "В архиве отсутствует учётная запись автора или назначенного преподавателя." });
    }
    if (!sources.groupIds?.has(event.after.groupId)) issue({ level: "review", code: "unresolved-teaching-group", recordId: event.after.id, referenceId: event.after.groupId, message: "Группа назначения не подтверждена сохранённым справочником; встроенные данные не подставлялись." });
    if (!sources.subjectIds) issue({ level: "review", code: "unchecked-teaching-subject", recordId: event.after.id, referenceId: event.after.subjectId, message: "Справочник дисциплин отсутствует в архиве." });
    else if (!sources.subjectIds.has(event.after.subjectId)) issue({ level: "error", code: "missing-teaching-subject", recordId: event.after.id, referenceId: event.after.subjectId, message: "Дисциплина назначения отсутствует в архиве." });
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "teaching-event-after-backup", recordId: event.id, message: "Назначение изменено позже завершения архива." });
    for (const entry of event.after.periods) {
      if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
      if (!lookup) issue({ level: "review", code: "unchecked-teaching-period", recordId: event.id, referenceId: entry.period.term.id, message: "Снимок семестра назначения не проверен: источник отсутствует в архиве." });
      else if (!lookup(entry.period, event.occurredAt)) issue({ level: "error", code: "inconsistent-teaching-period", recordId: event.id, referenceId: entry.period.term.id, message: "Снимок семестра назначения не соответствует его истории в архиве." });
    }
  }
  for (const lesson of [...(sources.schedule?.published.flatMap(week => week.lessons) ?? []), ...(sources.schedule?.journal ?? []), ...(sources.schedule?.publications?.flatMap(version => version.week.lessons) ?? [])]) {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    if (!lesson.teachingAssignmentId) continue;
    const assignment = versions.get(JSON.stringify([lesson.teachingAssignmentId, lesson.teachingAssignmentRevision]));
    if (!assignment || assignment.teacherId !== lesson.teacherId || assignment.subjectId !== lesson.subjectId || assignment.groupId !== lesson.groupId) issue({ level: "error", code: "missing-published-teaching-version", recordId: lesson.id, referenceId: lesson.teachingAssignmentId, message: "Сохранённая версия назначения опубликованного занятия отсутствует или относится к другой учебной области." });
    else if (assignment.mode === "periods" && !assignment.periods.some(entry => entry.types.includes(lesson.type) && entry.period.term.startsOn <= lesson.date && entry.period.term.endsOn >= lesson.date)) issue({ level: "error", code: "published-teaching-outside-scope", recordId: lesson.id, referenceId: assignment.id, message: "Тип или дата опубликованного занятия не входят в сохранённую версию назначения." });
  }
  if (document.history.length) {
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-teaching-cutoff", message: "Время завершения архива не подтверждено." });
    issue({ level: "review", code: "unconfirmed-teaching-authority", message: "Исторические полномочия, общие назначения учёток и ссылки расписания на выбранные версии назначений требуют итоговой проверки. Схема не разрешает восстановление." });
  }
  return issues;
}
