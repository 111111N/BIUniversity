import { decodeAccountsDocument } from "./accounts";
import { decodeGroupCatalog } from "./groupCatalog";
import { decodeSubjectCatalog } from "./subjectCatalog";
import { decodeManagedSchedule, MANAGED_SCHEDULE_KEY } from "./scheduleManagement";
import { CURRICULA_KEY, type CurriculaDocument } from "./curriculumTypes";
import { EDUCATION_DIRECTORIES_KEY, type EducationDirectoriesDocument } from "./educationDirectories";
import { GROUP_CALENDARS_KEY, type GroupCalendarsDocument } from "./groupCalendarTypes";
import { TEACHING_ASSIGNMENTS_KEY, type TeachingAssignmentsDocument } from "./teachingAssignments";
import { ROOMS_KEY, type RoomsDocument } from "./rooms";
import { SCHEDULE_TEMPLATES_KEY, type ScheduleTemplatesDocument } from "./scheduleTemplates";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import type { BackupRecordEntries } from "./backupRecordComparison";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import { inspectArchivedCurricula } from "./backupCurricula";
import { inspectArchivedGroupCalendars } from "./backupGroupCalendars";
import { inspectArchivedTeachingAssignments } from "./backupTeachingAssignments";
import { inspectArchivedRooms } from "./backupRooms";
import { inspectArchivedScheduleTemplates } from "./backupScheduleTemplates";
import type { SelectedBaseDocuments } from "./backupBaseSelection";
import { inspectSelectedBaseDependencies } from "./backupSelectedBaseDependencies";
import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument } from "./assessmentTypes";
import { inspectAssessmentDependencies } from "./backupAssessmentDependencies";
import type { SelectedListSources } from "./backupListSelection";
import { inspectBackupPlanners } from "./backupPlannerDocuments";
import { inspectBackupNotifications } from "./backupNotificationDocuments";
import { inspectBackupJournals } from "./backupJournalDocuments";
import { decodeBackupAssignments, decodeBackupSubmissions } from "./assignmentStorage";
import { inspectLearningDependencies } from "./backupLearningDependencies";
import { inspectBackupSettings } from "./backupSettingsDocuments";

export interface SelectedDependenciesReview { scope: "selected-document-dependencies"; status: "blocked" | "checks-complete"; checkedAt: string; issues: BackupDocumentIssue[]; counts: { errors: number; unconfirmed: number } }

/** Existing inspectors run against candidates only. Differing unsolved base documents are never given priority. */
export async function inspectSelectedBackupDependencies(archive: BackupRecordEntries, browser: BackupRecordEntries, selected: ReadonlyMap<string, object>, periods: AcademicPeriodsDocument | undefined, checkedAt: string, signal?: AbortSignal, unavailable: readonly BackupDocumentIssue[] = [], baseDocuments?: SelectedBaseDocuments, lists?: SelectedListSources, preferences?: BackupRecordEntries): Promise<SelectedDependenciesReview> {
  checkBackupAbort(signal);
  if (!Number.isFinite(Date.parse(checkedAt))) throw new Error("Не удалось определить момент проверки выбранных зависимостей.");
  const issues: BackupDocumentIssue[] = [], seen = new Set<string>(), textBudget = createBackupBudget(), valueBudget = createBackupBudget(), issueBudget = createBackupBudget();
  const issue = (item: BackupDocumentIssue) => {
    const key = JSON.stringify([item.kind, item.code, item.recordId, item.referenceId]);
    if (seen.has(key)) return;
    if (issues.length >= BACKUP_LIMITS.records) throw new Error("Замечаний к выбранным зависимостям больше 25 000. Частичный результат не создан.");
    const finding = { ...item, message: item.message.replace(/в архиве/gu, "в выбранном наборе").replace(/из архива/gu, "из проверяемого набора").replace(/завершения архива/gu, "момента проверки выбранных данных").replace(/после завершения резервной копии/gu, "после момента проверки выбранных данных").replace(/на дату архива/gu, "на момент проверки выбранных данных").replace(/дата завершения архива/gu, "момент проверки выбранных данных") };
    addBackupText(issueBudget, JSON.stringify(finding)); seen.add(key); issues.push(finding);
  };
  unavailable.forEach(issue);
  const compatible = async <T extends object>(key: string, prefix: string, decode: (raw: string) => T) => {
    if (baseDocuments) {
      const result = baseDocuments.get(key);
      if (!result || result.review.status === "blocked") return { state: "unresolved" as const };
      if (result.review.status === "absent") return { state: "compatible" as const, document: undefined };
      if (!result.document) return { state: "invalid" as const };
      return { state: "compatible" as const, document: result.document as T };
    }
    const read = (entries: BackupRecordEntries) => {
      const rows = entries.filter(row => row.key.startsWith(prefix));
      if (!rows.length) return undefined;
      if (rows.length !== 1 || rows[0].key !== key) throw new Error("Ключ источника неоднозначен или не поддерживается.");
      addBackupText(textBudget, rows[0].key); addBackupText(textBudget, rows[0].raw); return decode(rows[0].raw);
    };
    try {
      const a = read(archive), b = read(browser);
      if (a && b && canonicalBackupValue(await encodeBackupValue(a, valueBudget, signal)) !== canonicalBackupValue(await encodeBackupValue(b, valueBudget, signal))) return { state: "unresolved" as const };
      return { state: "compatible" as const, document: b ?? a };
    } catch (error) { checkBackupAbort(signal); if (!(error instanceof Error)) throw error; return { state: "invalid" as const }; }
  };
  const accounts = await compatible("bi-university-accounts-v1", "bi-university-accounts-", decodeAccountsDocument);
  const groups = await compatible("bi-university-group-catalog-v1", "bi-university-group-catalog-", decodeGroupCatalog);
  const subjects = await compatible("bi-university-subject-catalog-v1", "bi-university-subject-catalog-", decodeSubjectCatalog);
  const schedule = await compatible(MANAGED_SCHEDULE_KEY, "bi-university-managed-schedule-", raw => { const value = decodeManagedSchedule(raw); if (!value) throw new Error("Расписание повреждено."); return value; });
  const directories = selected.get(EDUCATION_DIRECTORIES_KEY) as EducationDirectoriesDocument | undefined, curricula = selected.get(CURRICULA_KEY) as CurriculaDocument | undefined;
  const calendars = selected.get(GROUP_CALENDARS_KEY) as GroupCalendarsDocument | undefined, teaching = selected.get(TEACHING_ASSIGNMENTS_KEY) as TeachingAssignmentsDocument | undefined;
  const rooms = selected.get(ROOMS_KEY) as RoomsDocument | undefined, templates = selected.get(SCHEDULE_TEMPLATES_KEY) as ScheduleTemplatesDocument | undefined;
  for (const [kind, state, needed] of [["accounts", accounts.state, Boolean(periods?.history.length) || [...selected.values()].some(value => "history" in value && Array.isArray(value.history) && value.history.length > 0)], ["groups", groups.state, Boolean(curricula?.bindings.length || calendars?.calendars.length || teaching?.assignments.length)], ["subjects", subjects.state, Boolean(curricula?.plans.some(plan => plan.entries.length) || teaching?.assignments.length)], ["schedule", schedule.state, Boolean(rooms || templates || teaching)]] as const) {
    if (needed && state !== "compatible") issue({ kind, level: "review", code: `unresolved-selected-base-${kind}`, message: state === "invalid" ? "Базовый документ повреждён, неоднозначен или превышает предел проверки. Поддерживаемая версия не подставлялась из другого источника." : "Базовые документы источников различаются. Выбор отдельных карточек не подтверждает их полную историю, метаданные и связанные записи; требуется итоговое согласование." });
  }
  const accountIds = accounts.document && new Set(accounts.document.accounts.map(row => row.id)), groupIds = groups.document && new Set(groups.document.groups.map(row => row.id)), subjectIds = subjects.document && new Set(subjects.document.subjects.map(row => row.id));
  const assessments = selected.get(ASSESSMENTS_STORAGE_KEY) as AssessmentDocument | undefined;
  if (preferences) for (const finding of (await inspectBackupSettings(preferences, accounts.document?.accounts, signal)).issues) issue(finding);
  await inspectSelectedBaseDependencies({ accounts: accounts.document, groups: groups.document, subjects: subjects.document, schedule: schedule.document, rooms, assessments }, checkedAt, issue, signal);
  if (assessments) for (const finding of await inspectAssessmentDependencies(assessments, { accountIds, groupIds, subjectIds, periods }, checkedAt, signal)) issue(finding);
  if (lists) {
    const assignments = lists.assignments.length ? decodeBackupAssignments(lists.assignments[0].raw) : undefined;
    const submissions = lists.submissions.length ? decodeBackupSubmissions(lists.submissions[0].raw) : undefined;
    for (const finding of await inspectLearningDependencies(assignments, submissions, { accountIds, subjectIds, groupIds, unconfirmedAttachments: true }, checkedAt, signal)) issue(finding);
    for (const finding of (await inspectBackupPlanners(lists.planners, accountIds, signal, checkedAt)).issues) issue(finding);
    for (const finding of (await inspectBackupNotifications(lists.notifications, accountIds, signal, { subjectIds, groupIds, assignments, submissions }, checkedAt)).issues) issue(finding);
    for (const finding of (await inspectBackupJournals(lists.journals, signal, { subjectIds, groupIds, lessonSource: { schedule: schedule.document }, peopleSource: { accountIds }, unavailableJournalKeys: lists.unavailableJournalKeys, completedAt: checkedAt })).issues) issue(finding);
  }
  let steps = 0;
  if (periods) for (const event of periods.history) {
    if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal);
    if (!accountIds?.has(event.actorId)) issue({ kind: "periods", level: accountIds ? "error" : "review", code: "unresolved-selected-period-author", recordId: event.id, referenceId: event.actorId, message: "Автор учебного периода не подтверждён согласованным источником учёток." });
    if (Date.parse(event.occurredAt) > Date.parse(checkedAt)) issue({ kind: "periods", level: "error", code: "selected-period-event-after-check", recordId: event.id, message: "Событие учебного периода датировано позже момента проверки выбранных данных." });
  }
  if (periods?.history.length) issue({ kind: "periods", level: "review", code: "unconfirmed-selected-period-authority", message: "Наличие автора не подтверждает его исторические полномочия на изменение учебного периода." });
  if (directories) for (const event of directories.history) {
    if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
    if (!accountIds?.has(event.actorId)) issue({ kind: "educationDirectories", level: accountIds ? "error" : "review", code: "unresolved-selected-directory-author", recordId: event.id, referenceId: event.actorId, message: "Автор изменения программы/формы не подтверждён согласованным источником учёток." });
    if (Date.parse(event.occurredAt) > Date.parse(checkedAt)) issue({ kind: "educationDirectories", level: "error", code: "selected-directory-event-after-check", recordId: event.id, message: "Событие программы/формы датировано позже момента проверки выбранных данных." });
  }
  if (directories?.history.length) issue({ kind: "educationDirectories", level: "review", code: "unconfirmed-selected-directory-authority", message: "Наличие автора не подтверждает его исторические полномочия на изменение программы или формы обучения." });
  if (curricula) for (const finding of await inspectArchivedCurricula(curricula, { accountIds, groupIds, subjectIds, subjects: subjects.document, directories, periods }, checkedAt, signal)) issue(finding);
  if (calendars) for (const finding of await inspectArchivedGroupCalendars(calendars, { accountIds, groupIds, periods }, checkedAt, signal)) issue(finding);
  if (teaching) for (const finding of await inspectArchivedTeachingAssignments(teaching, { accountIds, groupIds, subjectIds, periods, schedule: schedule.document }, checkedAt, signal)) issue(finding);
  else if (schedule.document && [...schedule.document.published.flatMap(week => week.lessons), ...schedule.document.journal, ...(schedule.document.publications?.flatMap(version => version.week.lessons) ?? [])].some(lesson => lesson.teachingAssignmentId)) issue({ kind: "teachingAssignments", level: "error", code: "missing-selected-teaching-source", message: "Расписание ссылается на версии назначений, но выбранный источник назначений отсутствует или не согласован со своей историей." });
  if (rooms || schedule.document) for (const finding of await inspectArchivedRooms(rooms, { accountIds, schedule: schedule.document }, checkedAt, signal)) issue(finding);
  if (templates) for (const finding of await inspectArchivedScheduleTemplates(templates, { accountIds, schedule: schedule.document }, checkedAt, signal)) issue(finding);
  checkBackupAbort(signal);
  return { scope: "selected-document-dependencies", status: issues.length ? "blocked" : "checks-complete", checkedAt, issues, counts: { errors: issues.filter(row => row.level === "error").length, unconfirmed: issues.filter(row => row.level === "review").length } };
}
