import { ASSESSMENTS_STORAGE_KEY } from "./assessmentTypes";
import { decodeAssessmentDocument } from "./assessments";
import { isBackupAssessmentKey } from "./backupAssessmentDocuments";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

const ASSESSMENT_FIELDS = ["title", "kind", "subjectId", "subjectName", "groupId", "groupName", "period", "academicPeriod", "supervisorId", "recordBook", "roster", "attempts"] as const;
const HISTORY_FIELDS = ["assessmentId", "attemptId", "actorId", "occurredAt", "action", "results", "recordBook", "assignment", "assignmentOrigin", "reason", "previousSupervisorId", "academicPeriod"] as const;
export type AssessmentComparedField = typeof ASSESSMENT_FIELDS[number] | "other";
export type AssessmentHistoryComparedField = typeof HISTORY_FIELDS[number] | "other";
const CORRECTION_FIELDS = ["assessmentId", "attemptId", "version", "reason", "openedAt", "openedBy", "state", "results", "publishedAt", "publishedBy"] as const;
const CORRECTION_HISTORY_FIELDS = ["correctionId", "actorId", "occurredAt", "action", "results", "reason"] as const;
export type AssessmentCorrectionComparedField = typeof CORRECTION_FIELDS[number] | typeof CORRECTION_HISTORY_FIELDS[number] | "other";
export interface BackupAssessmentComparison {
  version: 1 | 2;
  assessments: BackupRecordComparison<AssessmentComparedField>;
  history: BackupRecordComparison<AssessmentHistoryComparedField>;
  corrections?: BackupRecordComparison<AssessmentCorrectionComparedField>;
  correctionHistory?: BackupRecordComparison<AssessmentCorrectionComparedField>;
}
const source = { matchesKey: isBackupAssessmentKey, supportsKey: (key: string) => key === ASSESSMENTS_STORAGE_KEY };
const assessments: BackupRecordDefinition<AssessmentComparedField> = {
  ...source, collection: "assessments", label: "Аттестации", fields: ASSESSMENT_FIELDS,
  decode: (raw) => decodeAssessmentDocument(raw).assessments,
};
const history: BackupRecordDefinition<AssessmentHistoryComparedField> = {
  ...source, collection: "assessment-history", label: "История аттестаций", fields: HISTORY_FIELDS,
  decode: (raw) => decodeAssessmentDocument(raw).history,
};
const corrections: BackupRecordDefinition<AssessmentCorrectionComparedField> = { ...source, collection: "assessment-corrections", label: "Исправления аттестаций", fields: CORRECTION_FIELDS, decode: (raw) => decodeAssessmentDocument(raw).corrections };
const correctionHistory: BackupRecordDefinition<AssessmentCorrectionComparedField> = { ...source, collection: "assessment-correction-history", label: "Аудит исправлений аттестаций", fields: CORRECTION_HISTORY_FIELDS, decode: (raw) => decodeAssessmentDocument(raw).correctionHistory };

/** Compare independently validated documents; never infer access or select the newer revision. */
export const compareBackupAssessmentRecords = async (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupAssessmentComparison> => ({
  version: 2,
  assessments: await compareBackupRecords(archive, browser, assessments, signal),
  history: await compareBackupRecords(archive, browser, history, signal),
  corrections: await compareBackupRecords(archive, browser, corrections, signal),
  correctionHistory: await compareBackupRecords(archive, browser, correctionHistory, signal),
});
export const assertCompleteAssessmentComparison = (review: BackupAssessmentComparison) => {
  if (![1, 2].includes(review.version) || !review.assessments || !review.history) throw new Error("Сравнение аттестаций неполно или несовместимо. Проверьте архив заново; неполный отчёт не скачан.");
  assertCompleteBackupRecordComparison(review.assessments, assessments);
  assertCompleteBackupRecordComparison(review.history, history);
  if (review.version === 2 || review.corrections || review.correctionHistory) {
    if (review.version !== 2 || !review.corrections || !review.correctionHistory) throw new Error("Сравнение исправлений неполно. Проверьте архив заново; неполный отчёт не скачан.");
    assertCompleteBackupRecordComparison(review.corrections, corrections); assertCompleteBackupRecordComparison(review.correctionHistory, correctionHistory);
    if ([review.corrections, review.correctionHistory].some((part) => (["documents", "comparedDocuments", "uncheckedDocuments"] as const).some((field) => part.counts[field] !== review.assessments.counts[field]))) throw new Error("Сравнение исправлений неполно; неполный отчёт не скачан.");
  }
  if ((["documents", "comparedDocuments", "uncheckedDocuments"] as const).some((field) => review.assessments.counts[field] !== review.history.counts[field])) {
    throw new Error("Карточки аттестаций и история сравнены не полностью. Проверьте архив заново; неполный отчёт не скачан.");
  }
};
export const getUncheckedAssessmentDocuments = (review: BackupAssessmentComparison) => new Set([...review.assessments.uncompared, ...review.history.uncompared, ...(review.corrections?.uncompared ?? []), ...(review.correctionHistory?.uncompared ?? [])].map((entry) => entry.key)).size;
export const getAssessmentBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => [assessments, history, corrections, correctionHistory].find((definition) => definition.collection === collection);

export const ASSESSMENT_COMPARISON_LABELS: Record<AssessmentComparedField | AssessmentHistoryComparedField | AssessmentCorrectionComparedField, string> = {
  title: "Название аттестации", kind: "Форма контроля", subjectId: "ID дисциплины", subjectName: "Сохранённое название дисциплины",
  groupId: "ID группы", groupName: "Сохранённое название группы", period: "Учебный период", supervisorId: "ID научного руководителя",
  recordBook: "Реквизиты зачётки", roster: "Зафиксированный состав", attempts: "Попытки и результаты",
  assessmentId: "ID аттестации", attemptId: "ID попытки", actorId: "ID автора", occurredAt: "Время события", action: "Действие",
  results: "Снимок результатов", assignment: "Снимок назначения", assignmentOrigin: "Происхождение назначения", reason: "Причина изменения", other: "Дополнительные поля",
  version: "Версия ведомости", openedAt: "Разрешено исправление", openedBy: "ID разрешившего исправление", state: "Состояние исправления", publishedAt: "Время публикации", publishedBy: "ID опубликовавшего", correctionId: "ID исправления",
  previousSupervisorId: "ID прежнего научного руководителя",
  academicPeriod: "Сохранённый учебный год и семестр",
};
