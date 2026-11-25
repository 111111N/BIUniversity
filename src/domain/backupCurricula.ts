import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { EducationDirectoriesDocument } from "./educationDirectories";
import type { CurriculaDocument } from "./curriculumTypes";
import { sameCurriculumData } from "./curricula";
import { checkBackupAbort } from "./localBackup";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import type { SubjectCatalogDocument } from "./subjectCatalog";
import { createBackupSubjectSnapshotLookup } from "./backupSubjectSnapshots";

const SUBJECT_SNAPSHOT_MESSAGES = {
  unconfirmed: ["unchecked-curriculum-subject-snapshot", "Снимок дисциплины не подтверждён: полный источник или явная история этой ревизии недоступны. Реквизиты старого формата и ревизии 0 не восстанавливались из текущего названия."],
  "missing-subject": ["missing-curriculum-subject", "Дисциплина снимка отсутствует в полном сохранённом каталоге. Запись не сопоставлялась по имени."],
  "missing-revision": ["missing-curriculum-subject-revision", "Указанная ревизия дисциплины не найдена в явной истории полного каталога. Текущая карточка не заменяет сохранённую версию."],
  "different-values": ["inconsistent-curriculum-subject-snapshot", "Название или сокращение дисциплины в снимке плана не совпадает с указанной ревизией её истории. Значения не исправлялись."],
  "later-revision": ["future-curriculum-subject-snapshot", "Указанная ревизия дисциплины сохранена позже события учебного плана. Время и снимок не изменялись."],
} as const;

interface Dependencies { accountIds?: Set<string>; groupIds?: Set<string>; subjectIds?: Set<string>; subjects?: SubjectCatalogDocument; directories?: EducationDirectoriesDocument; periods?: AcademicPeriodsDocument }
/** Only archive contents are used; a valid schema does not establish historical authority. */
async function inspectCurriculumSources(document: CurriculaDocument, dependencies: Dependencies, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const { issues, add } = createBackupIssueCollector("зависимостям учебных планов"), work = createBackupInspectionWork("сверки учебных планов", signal), step = work.step;
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => add({ kind: "curricula", ...value });
  await step(0); work.assertRecords(document.history.length);
  if (!document.history.length) return issues;
  for (const rows of [dependencies.directories?.history ?? [], dependencies.periods?.history ?? []]) work.assertRecords(rows.length);
  await step(dependencies.periods?.history.length ?? 0);
  const checkReference = (ids: Set<string> | undefined, id: string, label: string, recordId: string) => {
    if (!ids) issue({ level: "review", code: `unchecked-curriculum-${label}`, referenceId: id, recordId, message: "Связь учебного плана не проверена: соответствующий справочник отсутствует или не читается в архиве." });
    else if (!ids.has(id)) issue({ level: label === "author" ? "error" : "review", code: `unresolved-curriculum-${label}`, referenceId: id, recordId, message: "Связь учебного плана не подтверждена сохранённым справочником. Встроенные примеры и данные браузера не подставляются." });
  };
  const periodLookup = dependencies.periods && createAssessmentPeriodHistoryLookup(dependencies.periods);
  const subjectLookup = dependencies.subjects && await createBackupSubjectSnapshotLookup(dependencies.subjects, signal);
  const directorySnapshots = new Map<string, { at: number; value: object }>();
  for (const event of dependencies.directories?.history ?? []) {
    await step();
    const key = JSON.stringify([event.entity, event.after.id, event.after.revision]);
    work.addText(key);
    directorySnapshots.set(key, { at: Date.parse(event.occurredAt), value: event.after });
  }
  for (const event of document.history) {
    await step();
    checkReference(dependencies.accountIds, event.actorId, "author", event.id);
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "curriculum-event-after-backup", recordId: event.id, message: "Изменение учебного плана датировано позже завершения архива." });
    if (event.entity === "plan") {
      for (const [entity, record] of [["program", event.after.program], ["form", event.after.form]] as const) {
        const source = directorySnapshots.get(JSON.stringify([entity, record.id, record.revision]));
        if (!dependencies.directories) issue({ level: "review", code: "unchecked-curriculum-directory-snapshot", referenceId: record.id, recordId: event.id, message: "Исторический снимок программы или формы обучения не проверен: справочник отсутствует." });
        else if (!source || source.at > Date.parse(event.occurredAt) || !sameCurriculumData(source.value, record)) issue({ level: "error", code: "inconsistent-curriculum-directory-snapshot", referenceId: record.id, recordId: event.id, message: "Снимок программы или формы обучения не совпадает с её историей в архиве либо появился позже изменения плана." });
      }
      for (const entry of event.after.entries) {
        await step(); const recordId = JSON.stringify(["curriculum-event", event.id, "subject", entry.id]);
        if (!subjectLookup) checkReference(dependencies.subjectIds, entry.subject.id, "subject", recordId);
        const match = subjectLookup?.(entry.subject, event.occurredAt) ?? "unconfirmed";
        if (match === "confirmed") continue;
        const [code, message] = SUBJECT_SNAPSHOT_MESSAGES[match];
        issue({ level: match === "unconfirmed" ? "review" : "error", code, message, referenceId: entry.subject.id, recordId });
      }
    } else {
      checkReference(dependencies.groupIds, event.after.group.id, "group", event.id);
      for (const entry of event.after.periods) {
        await step();
        if (!periodLookup) issue({ level: "review", code: "unchecked-curriculum-period", recordId: event.id, referenceId: entry.period.term.id, message: "Календарный семестр группы не проверен: справочник периодов отсутствует." });
        else if (!periodLookup(entry.period, event.occurredAt)) issue({ level: "error", code: "inconsistent-curriculum-period", recordId: event.id, referenceId: entry.period.term.id, message: "Календарный семестр назначения не совпадает с историей периодов в архиве." });
      }
    }
  }
  if (document.history.length) {
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-curriculum-cutoff", message: "Время завершения архива не подтверждено для проверки истории учебных планов." });
    issue({ level: "review", code: "unconfirmed-curriculum-authority", message: "Исторические полномочия авторов, ранние снимки групп, последствия смены версии и остальные зависимости восстановления требуют отдельной проверки. Подтверждение явной ревизии дисциплины не разрешает восстановление." });
  }
  checkBackupAbort(signal);
  return issues;
}

export async function inspectArchivedCurricula(...args: Parameters<typeof inspectCurriculumSources>) {
  try { return await inspectCurriculumSources(...args); }
  catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить зависимости исторических учебных планов:", error);
    throw error;
  }
}
