import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument } from "./assessmentTypes";
import { decodeAssessmentDocument } from "./assessments";
import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";

export const BACKUP_ASSESSMENT_DOCUMENTS = {
  assessments: { key: ASSESSMENTS_STORAGE_KEY, prefix: "bi-university-assessments-", label: "Аттестации и ведомости" },
} as const;
export const isBackupAssessmentKey = (key: string): boolean => key.startsWith(BACKUP_ASSESSMENT_DOCUMENTS.assessments.prefix);
export interface BackupAssessmentSources {
  accountIds?: ReadonlySet<string>;
  groupIds?: ReadonlySet<string>;
  subjectIds?: ReadonlySet<string>;
}

/** Check archived IDs, never today's role, membership or name as proof of historical access. */
export async function inspectBackupAssessments(
  entries: AdministrativeBackup["localStorage"], sources: BackupAssessmentSources, completedAt: string, signal?: AbortSignal,
): Promise<{ checks: BackupDocumentCheck[]; issues: BackupDocumentIssue[] }> {
  checkBackupAbort(signal);
  const definition = BACKUP_ASSESSMENT_DOCUMENTS.assessments;
  const issues: BackupDocumentIssue[] = [];
  const seen = new Set<string>();
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => {
    const key = JSON.stringify([value.code, value.referenceId, value.recordId]);
    if (!seen.has(key)) { seen.add(key); issues.push({ kind: "assessments", ...value }); }
  };
  let count = 0;
  const step = async () => {
    if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const reference = (target: "account" | "group" | "subject", id: string, recordId: string) => {
    const ids = target === "account" ? sources.accountIds : target === "group" ? sources.groupIds : sources.subjectIds;
    const label = target === "account" ? "учётную запись" : target === "group" ? "группу" : "дисциплину";
    if (!ids) issue({ level: "review", code: `unchecked-assessment-${target}`, recordId, referenceId: id,
      message: `Ссылка на ${label} не проверена: соответствующий справочник отсутствует или не читается в архиве. Данные браузера не подставлялись.` });
    else if (!ids.has(id)) issue({ level: "error", code: `missing-assessment-${target}`, recordId, referenceId: id,
      message: `В архиве не найдена ссылка на ${label}. Записи не сопоставлялись по имени и не передавались другому участнику.` });
  };
  const cutoff = Date.parse(completedAt);
  const timestamp = (value: string, recordId: string) => {
    if (Number.isFinite(cutoff) && Date.parse(value) > cutoff) issue({ level: "error", code: "assessment-event-after-backup", recordId,
      message: "Сохранённое действие с ведомостью датировано позже завершения архива. Время и история не исправлялись." });
  };
  let documents = 0; let invalid = 0; let currentKeys = 0; let document: AssessmentDocument | undefined;
  for (const entry of entries) {
    await step();
    if (!isBackupAssessmentKey(entry.key)) continue;
    documents++;
    if (entry.key !== definition.key || ++currentKeys > 1) {
      invalid++;
      issue({ level: "error", code: "unsupported-assessment-key", referenceId: entry.key,
        message: "Неподдерживаемый или повторяющийся ключ аттестаций. Документы не объединялись и не заменялись другой версией." });
      continue;
    }
    try { document = decodeAssessmentDocument(entry.raw); }
    catch (error) {
      invalid++;
      issue({ level: "error", code: "invalid-document", referenceId: entry.key,
        message: error instanceof SyntaxError ? "Некорректный JSON аттестаций. Исходный текст не включён в отчёт."
          : "Не читается схема аттестаций: проверьте версию, ID, состав, результаты, комиссию и согласованность истории. Записи не исправлялись." });
    }
  }
  if (document) {
    if (document.assessments.length && !Number.isFinite(cutoff)) issue({ level: "review", code: "unchecked-assessment-cutoff",
      message: "Не удалось подтвердить время завершения архива для проверки дат сохранённых действий." });
    for (const assessment of document.assessments) {
      await step();
      reference("group", assessment.groupId, assessment.id);
      if (assessment.subjectId !== null) reference("subject", assessment.subjectId, assessment.id);
      if (assessment.supervisorId !== null) reference("account", assessment.supervisorId, assessment.id);
      for (const student of assessment.roster) { await step(); reference("account", student.studentId, assessment.id); }
      for (const attempt of assessment.attempts) {
        await step();
        reference("account", attempt.teacherId, attempt.id);
        reference("account", attempt.createdBy, attempt.id);
        if (attempt.publishedBy !== null) reference("account", attempt.publishedBy, attempt.id);
        if (attempt.chairId !== null) reference("account", attempt.chairId, attempt.id);
        for (const memberId of attempt.memberIds) { await step(); reference("account", memberId, attempt.id); }
        timestamp(attempt.createdAt, attempt.id);
        if (attempt.publishedAt !== null) timestamp(attempt.publishedAt, attempt.id);
      }
      // The current document has no independent historical authority or academic-period source.
      issue({ level: "review", code: "unconfirmed-assessment-authority", recordId: assessment.id,
        message: "Найденные ID и внутренняя история ведомости не подтверждают исторические полномочия и состав группы по независимому источнику. Текущие роли, блокировки и назначения не использованы вместо него." });
      issue({ level: "review", code: "unconfirmed-assessment-period", recordId: assessment.id,
        message: "Учебная область аттестации не подтверждена независимым источником: текст периода и номер семестра не заменяют связь с учебным периодом и программой." });
    }
    for (const entry of document.history) {
      await step(); reference("account", entry.actorId, entry.id); timestamp(entry.occurredAt, entry.id);
      if (entry.previousSupervisorId !== undefined) reference("account", entry.previousSupervisorId, entry.id);
      if (entry.assignment) {
        reference("account", entry.assignment.teacherId, entry.id);
        if (entry.assignment.chairId !== null) reference("account", entry.assignment.chairId, entry.id);
        for (const memberId of entry.assignment.memberIds) { await step(); reference("account", memberId, entry.id); }
        if (entry.assignmentOrigin === "legacy-snapshot") issue({ level: "review", code: "legacy-assessment-assignment", recordId: entry.id, referenceId: entry.attemptId,
          message: "Назначение старого формата получено из сохранённого снимка, а не из отдельной фиксации первоначальных значений. Для подтверждения истории нужен независимый источник." });
      }
    }
    for (const correction of document.corrections) {
      await step(); reference("account", correction.openedBy, correction.id); timestamp(correction.openedAt, correction.id);
      if (correction.publishedBy !== null) reference("account", correction.publishedBy, correction.id);
      if (correction.publishedAt !== null) timestamp(correction.publishedAt, correction.id);
    }
    for (const event of document.correctionHistory) { await step(); reference("account", event.actorId, event.id); timestamp(event.occurredAt, event.id); }
  }
  checkBackupAbort(signal);
  return { issues, checks: [{ kind: "assessments", key: definition.key, label: definition.label, documents,
    status: !documents ? "absent" : invalid ? "invalid" : "valid",
    ...(document && !invalid ? { revision: document.revision, records: document.assessments.length } : {}),
    message: !documents ? "Аттестации не сохранены в архиве. Данные браузера и примеры не подставляются."
      : invalid ? "Документ аттестаций не прошёл проверку схемы или версии ключа. Исходные данные сохранены."
        : "Схема ведомостей, пересдач, комиссий и истории прочитана; ссылки проверены только по архивным справочникам. Это не подтверждение полномочий и не разрешение на восстановление.",
  }] };
}
