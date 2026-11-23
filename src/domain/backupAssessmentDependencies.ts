import type { AssessmentDocument } from "./assessmentTypes";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";

export interface AssessmentDependencySources {
  accountIds?: ReadonlySet<string>;
  groupIds?: ReadonlySet<string>;
  subjectIds?: ReadonlySet<string>;
  periods?: AcademicPeriodsDocument;
}

/** Sources are already decoded and selected; IDs never prove historical roles or membership. */
export async function inspectAssessmentDependencies(
  document: AssessmentDocument, sources: AssessmentDependencySources, completedAt: string, signal?: AbortSignal,
): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>(), budget = createBackupBudget();
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => {
    const key = JSON.stringify([value.code, value.referenceId, value.recordId]);
    if (seen.has(key)) return;
    if (issues.length >= BACKUP_LIMITS.records) throw new Error("Замечаний к зависимостям аттестаций больше 25 000. Частичный результат не создан.");
    const finding: BackupDocumentIssue = { kind: "assessments", ...value };
    addBackupText(budget, JSON.stringify(finding)); seen.add(key); issues.push(finding);
  };
  let count = 0;
  const step = async () => {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const reference = (target: "account" | "group" | "subject", id: string, recordId: string) => {
    const ids = target === "account" ? sources.accountIds : target === "group" ? sources.groupIds : sources.subjectIds;
    const label = target === "account" ? "учётную запись" : target === "group" ? "группу" : "дисциплину";
    if (!ids) issue({ level: "review", code: `unchecked-assessment-${target}`, recordId, referenceId: id,
      message: `Ссылка на ${label} не проверена: полный источник отсутствует или не согласован. Другие источники и встроенные данные не подставлялись.` });
    else if (!ids.has(id)) issue({ level: "error", code: `missing-assessment-${target}`, recordId, referenceId: id,
      message: `В проверяемом наборе не найдена ссылка на ${label}. Записи не сопоставлялись по имени и не передавались другому участнику.` });
  };
  const cutoff = Date.parse(completedAt);
  const timestamp = (value: string, recordId: string) => {
    if (Number.isFinite(cutoff) && Date.parse(value) > cutoff) issue({ level: "error", code: "assessment-event-after-backup", recordId,
      message: "Сохранённое действие с ведомостью датировано позже установленной границы проверки. Время и история не исправлялись." });
  };
  const record = (...parts: string[]) => JSON.stringify(parts);
  checkBackupAbort(signal);
  const periodExists = sources.periods ? createAssessmentPeriodHistoryLookup(sources.periods) : undefined;
  if (document.assessments.length && !Number.isFinite(cutoff)) issue({ level: "review", code: "unchecked-assessment-cutoff",
    message: "Не удалось подтвердить границу времени для проверки дат сохранённых действий." });
  for (const assessment of document.assessments) {
    await step();
    const assessmentId = record("assessment", assessment.id);
    reference("group", assessment.groupId, assessmentId);
    if (assessment.subjectId !== null) reference("subject", assessment.subjectId, assessmentId);
    if (assessment.academicPeriod) {
      if (!sources.periods) issue({ level: "review", code: "unchecked-assessment-period", recordId: assessmentId, message: "Связь с учебным периодом не проверена: полный согласованный справочник периодов отсутствует или не читается." });
      else if (!periodExists!(assessment.academicPeriod, assessment.attempts[0].createdAt)) issue({ level: "error", code: "missing-assessment-period-snapshot", recordId: assessmentId, referenceId: assessment.academicPeriod.term.id, message: "Сохранённый снимок учебного года и семестра не подтверждён историей справочника на указанной ревизии. Имена и сегодняшние даты не подставлялись." });
    }
    if (assessment.supervisorId !== null) reference("account", assessment.supervisorId, assessmentId);
    for (const student of assessment.roster) { await step(); reference("account", student.studentId, assessmentId); }
    for (const attempt of assessment.attempts) {
      await step();
      const attemptId = record("attempt", assessment.id, attempt.id);
      reference("account", attempt.teacherId, attemptId);
      reference("account", attempt.createdBy, attemptId);
      if (attempt.publishedBy !== null) reference("account", attempt.publishedBy, attemptId);
      if (attempt.chairId !== null) reference("account", attempt.chairId, attemptId);
      for (const memberId of attempt.memberIds) { await step(); reference("account", memberId, attemptId); }
      timestamp(attempt.createdAt, attemptId);
      if (attempt.publishedAt !== null) timestamp(attempt.publishedAt, attemptId);
    }
    // Period history does not establish the historical authority or the academic program.
    issue({ level: "review", code: "unconfirmed-assessment-authority", recordId: assessmentId,
      message: "Найденные ID и внутренняя история ведомости не подтверждают исторические полномочия и состав группы по независимому источнику. Текущие роли, блокировки и назначения не использованы вместо него." });
    issue({ level: "review", code: "unconfirmed-assessment-period", recordId: assessmentId,
      message: assessment.academicPeriod ? "Связь с календарём не подтверждает учебную программу группы и исторические полномочия. Учебная область требует независимого подтверждения." : "Учебная область аттестации не подтверждена независимым источником: текст периода и номер семестра не заменяют связь с учебным периодом и программой." });
  }
  for (const entry of document.history) {
    await step(); const eventId = record("assessment-history", entry.id);
    reference("account", entry.actorId, eventId); timestamp(entry.occurredAt, eventId);
    if (entry.previousSupervisorId !== undefined) reference("account", entry.previousSupervisorId, eventId);
    if (entry.assignment) {
      reference("account", entry.assignment.teacherId, eventId);
      if (entry.assignment.chairId !== null) reference("account", entry.assignment.chairId, eventId);
      for (const memberId of entry.assignment.memberIds) { await step(); reference("account", memberId, eventId); }
      if (entry.assignmentOrigin === "legacy-snapshot") issue({ level: "review", code: "legacy-assessment-assignment", recordId: eventId, referenceId: entry.attemptId,
        message: "Назначение старого формата получено из сохранённого снимка, а не из отдельной фиксации первоначальных значений. Для подтверждения истории нужен независимый источник." });
    }
  }
  for (const correction of document.corrections) {
    await step(); const correctionId = record("assessment-correction", correction.id);
    reference("account", correction.openedBy, correctionId); timestamp(correction.openedAt, correctionId);
    if (correction.publishedBy !== null) reference("account", correction.publishedBy, correctionId);
    if (correction.publishedAt !== null) timestamp(correction.publishedAt, correctionId);
  }
  for (const event of document.correctionHistory) {
    await step(); const eventId = record("assessment-correction-history", event.id);
    reference("account", event.actorId, eventId); timestamp(event.occurredAt, eventId);
  }
  checkBackupAbort(signal);
  return issues;
}
