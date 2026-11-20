import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { EducationDirectoriesDocument } from "./educationDirectories";
import type { CurriculaDocument } from "./curriculumTypes";
import { sameCurriculumData } from "./curricula";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

interface Dependencies { accountIds?: Set<string>; groupIds?: Set<string>; subjectIds?: Set<string>; directories?: EducationDirectoriesDocument; periods?: AcademicPeriodsDocument }
/** Only archive contents are used; a valid schema does not establish historical authority. */
export async function inspectArchivedCurricula(document: CurriculaDocument, dependencies: Dependencies, completedAt: string, signal?: AbortSignal): Promise<BackupDocumentIssue[]> {
  const issues: BackupDocumentIssue[] = [];
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => issues.push({ kind: "curricula", ...value });
  const checkReference = (ids: Set<string> | undefined, id: string, label: string, recordId: string) => {
    if (!ids) issue({ level: "review", code: `unchecked-curriculum-${label}`, referenceId: id, recordId, message: "Связь учебного плана не проверена: соответствующий справочник отсутствует или не читается в архиве." });
    else if (!ids.has(id)) issue({ level: label === "author" ? "error" : "review", code: `unresolved-curriculum-${label}`, referenceId: id, recordId, message: "Связь учебного плана не подтверждена сохранённым справочником. Встроенные примеры и данные браузера не подставляются." });
  };
  const periodLookup = dependencies.periods && createAssessmentPeriodHistoryLookup(dependencies.periods);
  const directorySnapshots = new Map<string, string[]>();
  for (const event of dependencies.directories?.history ?? []) {
    const key = JSON.stringify([event.entity, event.after.id, event.after.revision]);
    directorySnapshots.set(key, [event.occurredAt, JSON.stringify(event.after)]);
  }
  let count = 0;
  for (const event of document.history) {
    if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    checkReference(dependencies.accountIds, event.actorId, "author", event.id);
    if (Date.parse(event.occurredAt) > Date.parse(completedAt)) issue({ level: "error", code: "curriculum-event-after-backup", recordId: event.id, message: "Изменение учебного плана датировано позже завершения архива." });
    if (event.entity === "plan") {
      for (const [entity, record] of [["program", event.after.program], ["form", event.after.form]] as const) {
        const source = directorySnapshots.get(JSON.stringify([entity, record.id, record.revision]));
        if (!dependencies.directories) issue({ level: "review", code: "unchecked-curriculum-directory-snapshot", referenceId: record.id, recordId: event.id, message: "Исторический снимок программы или формы обучения не проверен: справочник отсутствует." });
        else if (!source || source[0] > event.occurredAt || !sameCurriculumData(JSON.parse(source[1]), record)) issue({ level: "error", code: "inconsistent-curriculum-directory-snapshot", referenceId: record.id, recordId: event.id, message: "Снимок программы или формы обучения не совпадает с её историей в архиве либо появился позже изменения плана." });
      }
      for (const entry of event.after.entries) checkReference(dependencies.subjectIds, entry.subject.id, "subject", event.id);
    } else {
      checkReference(dependencies.groupIds, event.after.group.id, "group", event.id);
      for (const entry of event.after.periods) {
        if (!periodLookup) issue({ level: "review", code: "unchecked-curriculum-period", recordId: event.id, referenceId: entry.period.term.id, message: "Календарный семестр группы не проверен: справочник периодов отсутствует." });
        else if (!periodLookup(entry.period, event.occurredAt)) issue({ level: "error", code: "inconsistent-curriculum-period", recordId: event.id, referenceId: entry.period.term.id, message: "Календарный семестр назначения не совпадает с историей периодов в архиве." });
      }
    }
  }
  if (document.history.length) {
    if (!Number.isFinite(Date.parse(completedAt))) issue({ level: "review", code: "unchecked-curriculum-cutoff", message: "Время завершения архива не подтверждено для проверки истории учебных планов." });
    issue({ level: "review", code: "unconfirmed-curriculum-authority", message: "Исторические полномочия авторов, снимки дисциплин и групп, последствия смены версии и зависимости выборочного восстановления требуют отдельной проверки. Восстановление не разрешено." });
  }
  return issues;
}
