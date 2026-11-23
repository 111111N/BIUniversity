import type { AccountsDocument } from "./accounts";
import type { AssessmentDocument } from "./assessmentTypes";
import { isSubjectActive, type SubjectCatalogDocument } from "./subjectCatalog";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";

interface Sources {
  accounts?: AccountsDocument;
  schedule?: ManagedScheduleSnapshot;
  assessments?: AssessmentDocument;
}

/** Mirrors current subject archive dependencies; saved past publications are not current blockers. */
export async function inspectArchivedSubjectStates(
  subjects: SubjectCatalogDocument | undefined, sources: Sources, completedAt: string, signal?: AbortSignal,
): Promise<{ issues: BackupDocumentIssue[]; summary: string }> {
  const issues: BackupDocumentIssue[] = [], budget = createBackupBudget();
  const archived = new Set<string>();
  const stats = { assignments: 0, drafts: 0, future: 0, past: 0, assessments: 0 };
  let steps = 0;
  const step = async () => {
    if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const issue = (level: BackupDocumentIssue["level"], code: string, message: string, subjectId?: string, path?: string[]) => {
    if (issues.length >= BACKUP_LIMITS.records) throw new Error("Замечаний к состояниям дисциплин больше 25 000. Частичный результат не создан.");
    const finding: BackupDocumentIssue = { kind: "subjects", level, code, message,
      ...(subjectId ? { referenceId: subjectId } : {}), ...(path ? { recordId: JSON.stringify(path) } : {}) };
    addBackupText(budget, JSON.stringify(finding)); issues.push(finding);
  };
  checkBackupAbort(signal);
  if (!subjects) return { issues, summary: "Состояния дисциплин не проверены: полный каталог отсутствует или не читается. Встроенные данные не подставлялись." };
  for (const subject of subjects.subjects) { await step(); if (!isSubjectActive(subject)) archived.add(subject.id); }
  if (!archived.size) return { issues, summary: "Архивированных дисциплин: 0. Зависимости архивирования не требуются." };

  const { accounts, schedule, assessments } = sources;
  const timestamp = Date.parse(completedAt);
  if (!accounts) issue("review", "unchecked-archived-subject-accounts", "Назначения архивированных дисциплин не проверены: полный источник учёток отсутствует или не читается. Отсутствие назначений не подтверждено.");
  if (!schedule) issue("review", "unchecked-archived-subject-schedule", "Пары архивированных дисциплин не проверены: полный источник расписания отсутствует или не читается. Отсутствие черновиков и незавершённых опубликованных пар не подтверждено.");
  if (!assessments) issue("review", "unchecked-archived-subject-assessments", "Ведомости архивированных дисциплин не проверены: полный согласованный источник аттестаций отсутствует или не читается. Отсутствие открытых попыток и исправлений не подтверждено.");
  if (schedule && !Number.isFinite(timestamp)) issue("review", "unchecked-archived-subject-time", "Незавершённые опубликованные пары дисциплин не определены: дата завершения архива некорректна. Время устройства не подставлялось.");
  for (const account of accounts?.accounts ?? []) {
    await step(); if (account.role !== "teacher") continue;
    const assigned = new Set<string>();
    for (const membership of account.memberships) {
      await step();
      if (!membership.groupIds.length || !archived.has(membership.subjectId) || assigned.has(membership.subjectId)) continue;
      assigned.add(membership.subjectId); stats.assignments++;
      issue("error", "archived-subject-assignment", "В архивированной дисциплине сохранено назначение преподавателя на группы. Блокировка входа не снимает назначение. Перед восстановлением нужно согласовать записи; назначение не изменялось.", membership.subjectId, ["teaching-assignment", account.id, membership.subjectId]);
    }
  }
  for (const week of schedule?.drafts ?? []) {
    await step();
    for (const lesson of week.lessons) {
      await step(); if (!archived.has(lesson.subjectId)) continue;
      stats.drafts++;
      issue("error", "archived-subject-draft", "В архивированной дисциплине сохранена пара черновика. Прошедшая дата не снимает эту зависимость. Перед восстановлением нужно согласовать записи; пара не удалялась.", lesson.subjectId, ["draft", week.groupId, week.weekStart, lesson.id]);
    }
  }
  for (const week of schedule?.published ?? []) {
    await step();
    for (const lesson of week.lessons) {
      await step(); if (!archived.has(lesson.subjectId) || !Number.isFinite(timestamp)) continue;
      if (Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) <= timestamp) { stats.past++; continue; }
      stats.future++;
      issue("error", "archived-subject-future-lesson", "В архивированной дисциплине сохранена опубликованная пара, которая ещё не завершилась на дату архива по московскому времени. Перед восстановлением нужно согласовать записи; пара не переносилась и не отменялась.", lesson.subjectId, ["published", week.groupId, week.weekStart, lesson.id]);
    }
  }
  const activeCorrections = new Set<string>();
  for (const correction of assessments?.corrections ?? []) {
    await step(); if (correction.state === "draft") activeCorrections.add(correction.assessmentId);
  }
  for (const assessment of assessments?.assessments ?? []) {
    await step(); if (assessment.subjectId === null || !archived.has(assessment.subjectId)) continue;
    let openAttempt = false;
    for (const attempt of assessment.attempts) { await step(); if (attempt.state === "draft") openAttempt = true; }
    if (!openAttempt && !activeCorrections.has(assessment.id)) continue;
    stats.assessments++;
    issue("error", "archived-subject-unfinished-assessment", "В архивированной дисциплине сохранена аттестация с открытой попыткой или исправлением. Будущий допсрок также остаётся открытой ведомостью. Перед восстановлением нужно согласовать записи; оценки и состояния не менялись.", assessment.subjectId, ["assessment", assessment.id]);
  }
  checkBackupAbort(signal);
  const known = (available: boolean, count: number) => available ? count : "не проверено";
  return { issues, summary: `Архивированных дисциплин: ${archived.size}. Назначений преподавателей: ${known(Boolean(accounts), stats.assignments)}; пар черновиков: ${known(Boolean(schedule), stats.drafts)}; незавершённых опубликованных пар на дату архива: ${known(Boolean(schedule) && Number.isFinite(timestamp), stats.future)}; прошедших опубликованных пар: ${known(Boolean(schedule) && Number.isFinite(timestamp), stats.past)}; незавершённых аттестаций: ${known(Boolean(assessments), stats.assessments)}. Это сверка сохранённых текущих состояний по действующим правилам, а не доказательство истории архивирования или полномочий. Записи не изменялись.` };
}
