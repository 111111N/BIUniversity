import { getBackupDifferenceKey, type BackupDifference, type BackupDifferenceReference } from "./backupComparison";
import { compareBackupRecords, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";
import { getPlannerBackupDefinition } from "./backupPlannerComparison";
import { getAccountBackupDefinition } from "./backupAccountComparison";
import { getCatalogBackupDefinition } from "./backupCatalogComparison";
import { getLearningBackupDefinition } from "./backupLearningComparison";
import { getScheduleBackupDefinition } from "./backupScheduleComparison";
import { compareBackupJournalRecords, getJournalBackupDefinition } from "./backupJournalComparison";
import { BACKUP_LIMITS, checkBackupAbort } from "./localBackup";
import { isBackupVisualPreferenceKey, readBackupVisualPreferencePreview } from "./backupVisualPreferences";
import { compareBackupNotificationRecords, getNotificationBackupDefinition } from "./backupNotificationComparison";
import { ASSESSMENT_COMPARISON_LABELS, getAssessmentBackupDefinition } from "./backupAssessmentComparison";

type RecordPreviewReference = Extract<BackupDifferenceReference, { storage: "localStorage-record" | "localStorage-child-record" | "localStorage-journal-record" }>;
export type BackupPreviewReference = RecordPreviewReference | Extract<BackupDifferenceReference, { storage: "localStorage" }>;
export interface BackupRecordPreview { reference: BackupPreviewReference; collectionLabel: string; rows: { field: string; label: string; archive: string; browser: string }[]; hasUnpreviewedFields: boolean }
const definitionFor = (collection: string) => getPlannerBackupDefinition(collection) ?? getAccountBackupDefinition(collection) ?? getCatalogBackupDefinition(collection) ?? getLearningBackupDefinition(collection) ?? getScheduleBackupDefinition(collection) ?? getJournalBackupDefinition(collection) ?? getNotificationBackupDefinition(collection) ?? getAssessmentBackupDefinition(collection);
export const canPreviewBackupDifference = (difference: BackupDifference): difference is BackupDifference & { reference: BackupPreviewReference } => {
  const reference = difference.reference;
  if (difference.kind !== "different" || !reference) return false;
  if (reference.storage === "localStorage") return difference.id === reference.key && isBackupVisualPreferenceKey(reference.key);
  if (!("collection" in reference) || reference.id !== difference.id) return false;
  const definition = definitionFor(reference.collection);
  if (!definition || !definition.supportsKey(reference.key)) return false;
  if (definition.collection === "submission-attempts") return reference.storage === "localStorage-child-record" && Boolean(reference.parentId);
  if (definition.collection === "schedule-journal") return reference.storage === "localStorage-journal-record" && Boolean(reference.subjectId.trim()) && Boolean(reference.groupId.trim());
  return reference.storage === "localStorage-record";
};
const LABELS: Record<string, string> = { title: "Название", name: "Название / ФИО", text: "Текст", createdAt: "Дата создания", updatedAt: "Дата изменения", startAt: "Начало", endAt: "Окончание", completed: "Выполнено", priority: "Приоритет", category: "Категория", course: "Курс", campus: "Корпус", admissionYear: "Год набора", status: "Состояние", previousNames: "Прежние названия", revision: "Ревизия", createdBy: "Автор создания", source: "Происхождение", shortName: "Сокращение", semester: "Семестр", color: "Цвет", groupId: "ID группы", subjectId: "ID дисциплины", actorId: "ID автора", occurredAt: "Дата события", action: "Действие", before: "Прежнее состояние", after: "Новое состояние", login: "Логин", role: "Тип учётки", email: "Почта", scheduleName: "Имя в расписании", memberships: "Учебные назначения", studentGroupId: "Учебная группа", enrollmentStatus: "Состояние обучения", studentRecord: "Реквизиты зачётки", accountId: "ID учётки", previousRole: "Прежний тип учётки", nextRole: "Новый тип учётки", previousMemberships: "Прежние назначения", nextMemberships: "Новые назначения", changes: "Изменения реквизитов", importBatchId: "Связь с импортом", studentOperationBatchId: "Связь с массовой операцией", educationEventId: "Связь с учебным событием", registeredAt: "Дата регистрации", accountRevisionAfter: "Ревизия после события", kind: "Вид события", effectiveDate: "Дата действия", basis: "Основание", documentNumber: "Номер документа", documentDate: "Дата документа", auditId: "Связь с аудитом", batchId: "Связь с массовой операцией", subject: "Дисциплина", group: "Группа", lessonDate: "Дата занятия", lessonType: "Тип занятия", description: "Условие", deadline: "Срок сдачи", attachmentId: "ID вложения", attachmentName: "Имя вложения", allowLateSubmissions: "Отправка после срока", assignmentId: "ID задания", studentId: "ID студента", studentName: "Имя студента", sentAt: "Дата отправки", comment: "Комментарий", grade: "Оценка", teacherComment: "Комментарий преподавателя", attemptCount: "Число попыток", attempts: "Сохранённые попытки", number: "Номер попытки", submittedLate: "Отправлено после срока", reviewedAt: "Дата проверки", scheduleId: "Числовой ID занятия", teacherId: "ID преподавателя", teacherName: "Преподаватель", date: "Дата", startsAt: "Начало", endsAt: "Окончание", type: "Тип занятия", room: "Аудитория", journalState: "Состояние связи", changedAt: "Дата изменения", actor: "Сохранённый автор", lessonId: "ID занятия", field: "Тип изменения", previousValue: "Прежнее значение", nextValue: "Новое значение" };
const text = (row: object, field: string) => Object.hasOwn(row, field) ? JSON.stringify((row as Record<string, unknown>)[field], null, 2) : "Поле отсутствует";
const NOTIFICATION_LABELS: Record<string, string> = { recipientUserId: "ID получателя", userId: "Старое поле ID получателя", recipientRole: "Сохранённая роль получателя", kind: "Вид уведомления", title: "Заголовок", body: "Текст уведомления", href: "Ссылка", createdAt: "Дата создания", read: "Прочитано", dedupeKey: "Ключ защиты от повторов" };
const matches = (row: object, reference: RecordPreviewReference, definition: BackupRecordDefinition<string>) => {
  if (!("id" in row) || row.id !== reference.id) return false;
  if (definition.collection === "submission-attempts") return reference.storage === "localStorage-child-record" && definition.parentId(row) === reference.parentId;
  if (definition.collection === "schedule-journal") {
    if (reference.storage !== "localStorage-journal-record") return false;
    const scope = definition.scope(row); return scope.subjectId === reference.subjectId && scope.groupId === reference.groupId;
  }
  return reference.storage === "localStorage-record";
};

/** Values are returned only to an authorized, snapshot-bound caller; never attach this result to the inspection report. */
export const readBackupRecordPreview = async (archive: BackupRecordEntries, browser: BackupRecordEntries, difference: BackupDifference, signal?: AbortSignal): Promise<BackupRecordPreview> => {
  checkBackupAbort(signal);
  if (!canPreviewBackupDifference(difference)) throw new Error("Для этого различия просмотр значений пока недоступен.");
  const reference = difference.reference;
  if (reference.storage === "localStorage") return readBackupVisualPreferencePreview(archive, browser, reference.key, signal);
  const definition = definitionFor(reference.collection)!;
  const relevant = (entries: BackupRecordEntries) => entries.filter(entry => entry.key === reference.key
    || (definition.collection === "journal-history" && ["bi-university-group-catalog-v1", "bi-university-subject-catalog-v1"].includes(entry.key))
    || (definition.collection === "notifications" && entry.key === "bi-university-accounts-v1"));
  const comparison = definition.collection === "journal-history" ? await compareBackupJournalRecords(relevant(archive), relevant(browser), signal)
    : definition.collection === "notifications" ? await compareBackupNotificationRecords(relevant(archive), relevant(browser), signal)
    : await compareBackupRecords(relevant(archive), relevant(browser), definition, signal);
  const confirmed = comparison.differences.find(item => getBackupDifferenceKey(item) === getBackupDifferenceKey(difference));
  if (!confirmed || confirmed.kind !== "different") throw new Error("Конфликт больше не подтверждён. Повторите проверку архива.");
  const read = (entries: BackupRecordEntries, source: "archive" | "browser") => {
    const documents = entries.filter(item => item.key === reference.key);
    if (documents.length !== 1 || documents[0].raw.length * 2 > BACKUP_LIMITS.textBytes) throw new Error("Источник версии недоступен или неоднозначен. Повторите проверку архива.");
    const rows = definition.decode(documents[0].raw, reference.key, source).filter(row => matches(row, reference, definition));
    if (rows.length !== 1) throw new Error("Запись версии недоступна или неоднозначна. Повторите проверку архива.");
    return definition.collection === "submission-attempts" ? definition.project(rows[0]) : rows[0];
  };
  const before = read(archive, "archive"), after = read(browser, "browser");
  const labels: Record<string, string> = definition.collection === "notifications" ? NOTIFICATION_LABELS
    : getAssessmentBackupDefinition(definition.collection) ? { ...ASSESSMENT_COMPARISON_LABELS, ...(definition.collection.startsWith("assessment-correction") ? { reason: "Причина исправления" } : {}) } : definition.collection === "subject-history" ? { ...LABELS, origin: "Происхождение снимка" } : LABELS;
  const rows = confirmed.fields.filter(field => field !== "other").map(field => ({ field, label: labels[field] ?? "Реквизиты", archive: text(before, field), browser: text(after, field) }));
  if (JSON.stringify(rows).length * 2 > 128 * 1024) throw new Error("Значения слишком велики для просмотра. Частичный текст не показан; сохраните исходный архив для отдельного разбора.");
  checkBackupAbort(signal);
  return { reference: structuredClone(reference), collectionLabel: definition.label, rows, hasUnpreviewedFields: confirmed.fields.includes("other") };
};
