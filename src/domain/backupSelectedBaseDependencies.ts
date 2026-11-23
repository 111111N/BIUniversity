import { getStudentGroupId, type AccountsDocument } from "./accounts";
import type { GroupCatalogDocument } from "./groupCatalog";
import type { SubjectCatalogDocument } from "./subjectCatalog";
import type { AssessmentDocument } from "./assessmentTypes";
import type { ManagedLesson, ManagedScheduleSnapshot } from "./scheduleManagement";
import type { RoomsDocument } from "./rooms";
import type { BackupDocumentIssue, BackupDocumentKind } from "./localBackupDocuments";
import { checkBackupAbort } from "./localBackup";
import { inspectArchivedGroupStates } from "./backupGroupStates";
import { inspectArchivedGroupHistory } from "./backupGroupHistory";
import { inspectArchivedSubjectStates } from "./backupSubjectStates";
import { inspectArchivedScheduleConflicts } from "./backupScheduleConflicts";
import { inspectArchivedSchedulePublications } from "./backupSchedulePublications";
import { indexArchivedAccountHistory } from "./backupAccountHistory";
import { inspectArchivedStudentNumbers } from "./backupStudentNumbers";
import { inspectArchivedStudentNumberHistory } from "./backupStudentNumberHistory";
import { inspectArchivedStudentOperations } from "./backupStudentOperations";
import { inspectArchivedStudentImports } from "./backupStudentImports";

interface Sources {
  accounts?: AccountsDocument; groups?: GroupCatalogDocument; subjects?: SubjectCatalogDocument;
  schedule?: ManagedScheduleSnapshot; rooms?: RoomsDocument; assessments?: AssessmentDocument;
}

/** Sources have passed full-source selection. Current roles never prove historical authority. */
export async function inspectSelectedBaseDependencies(sources: Sources, checkedAt: string, issue: (value: BackupDocumentIssue) => void, signal?: AbortSignal): Promise<void> {
  const cutoff = Date.parse(checkedAt);
  if (!Number.isFinite(cutoff)) throw new Error("Не определён момент проверки базовых зависимостей.");
  const { accounts, groups, subjects, schedule, rooms, assessments } = sources;
  const accountIds = accounts && new Set(accounts.accounts.map(row => row.id));
  const groupIds = groups && new Set(groups.groups.map(row => row.id));
  const subjectIds = subjects && new Set(subjects.subjects.map(row => row.id));
  let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const path = (...parts: string[]) => JSON.stringify(parts);
  const reference = (kind: BackupDocumentKind, recordId: string, target: "account" | "group" | "subject", id: string) => {
    const ids = target === "account" ? accountIds : target === "group" ? groupIds : subjectIds;
    const label = target === "account" ? "учётную запись" : target === "group" ? "группу" : "дисциплину";
    if (!ids) issue({ kind, level: "review", code: `unchecked-selected-${target}-reference`, recordId, referenceId: id, message: `Ссылка на ${label} не проверена: полный источник отсутствует или не согласован. Встроенные данные не подставлялись.` });
    else if (!ids.has(id)) issue({ kind, level: "error", code: `missing-selected-${target}-reference`, recordId, referenceId: id, message: `Ссылка ведёт на ${label}, которой нет в выбранном полном источнике. Запись не сопоставлялась по имени.` });
  };
  const timestamp = (kind: BackupDocumentKind, recordId: string, value?: string) => {
    if (value === undefined) return;
    const instant = Date.parse(value);
    if (!Number.isFinite(instant) || instant > cutoff) issue({ kind, level: "error", code: "invalid-selected-base-event-time", recordId, message: "Время сохранения записи некорректно или позже момента проверки выбранного набора. Дата будущего занятия сама по себе не является ошибкой." });
  };
  const memberships = async (recordId: string, rows: AccountsDocument["accounts"][number]["memberships"]) => {
    for (const membership of rows) {
      await step(); reference("accounts", recordId, "subject", membership.subjectId);
      for (const groupId of membership.groupIds) { await step(); reference("accounts", recordId, "group", groupId); }
    }
  };
  checkBackupAbort(signal);
  if (accounts) {
    for (const account of accounts.accounts) {
      await step(); const id = path("account", account.id), groupId = getStudentGroupId(account);
      if (groupId) reference("accounts", id, "group", groupId);
      else if (account.role === "student") issue({ kind: "accounts", level: "review", code: "unconfirmed-selected-student-group", recordId: id, message: "У студента не сохранён ID учебной группы. Группа не восстанавливалась по имени или встроенному примеру." });
      await memberships(id, account.memberships);
      timestamp("accounts", path("account-created", account.id), account.createdAt);
      timestamp("accounts", path("account-updated", account.id), account.updatedAt);
    }
    for (const event of accounts.history) {
      await step(); const id = path("account-history", event.id);
      reference("accounts", id, "account", event.actorId); reference("accounts", id, "account", event.accountId);
      timestamp("accounts", id, event.occurredAt);
      await memberships(path("account-history-before", event.id), event.previousMemberships ?? []);
      await memberships(path("account-history-after", event.id), event.nextMemberships ?? []);
    }
    for (const event of accounts.educationEvents ?? []) {
      await step(); const id = path("education-event", event.id);
      reference("accounts", id, "account", event.actorId); reference("accounts", id, "account", event.accountId);
      timestamp("accounts", id, event.registeredAt);
      if (event.before) reference("accounts", path("education-before", event.id), "group", event.before.groupId);
      reference("accounts", path("education-after", event.id), "group", event.after.groupId);
    }
    for (const person of accounts.persons ?? []) {
      await step(); timestamp("accounts", path("person-created", person.id), person.createdAt); timestamp("accounts", path("person-updated", person.id), person.updatedAt);
    }
    for (const event of accounts.personHistory ?? []) {
      await step(); const id = path("person-history", event.id);
      reference("accounts", id, "account", event.actorId); timestamp("accounts", id, event.occurredAt);
    }
    if (accounts.version === 1) issue({ kind: "accounts", level: "review", code: "unconfirmed-selected-legacy-people", message: "Старый документ учёток не содержит подтверждённого реестра людей и его истории. Человек не создавался и не объединялся по ФИО." });
    if (accounts.history.length || accounts.personHistory?.length || accounts.educationEvents?.length) issue({ kind: "accounts", level: "review", code: "unconfirmed-selected-account-authority", message: "Наличие авторов в выбранных учётках не подтверждает их роли и полномочия на момент исторических действий." });
    const history = await indexArchivedAccountHistory(accounts.history, signal);
    for (const finding of (await inspectArchivedStudentNumbers(accounts, signal)).issues) issue(finding);
    for (const finding of (await inspectArchivedStudentNumberHistory(accounts, signal, history)).issues) issue(finding);
    for (const finding of (await inspectArchivedStudentOperations(accounts, signal, history)).issues) issue(finding);
    for (const finding of (await inspectArchivedStudentImports(accounts, signal, history)).issues) issue(finding);
  }
  if (groups) {
    for (const group of groups.groups) {
      await step(); reference("groups", path("group-created", group.id), "account", group.createdBy);
      timestamp("groups", path("group-created", group.id), group.createdAt); timestamp("groups", path("group-updated", group.id), group.updatedAt);
    }
    for (const event of groups.history) {
      await step(); const id = path("group-history", event.id);
      reference("groups", id, "account", event.actorId); timestamp("groups", id, event.occurredAt);
    }
    if (groups.history.length) issue({ kind: "groups", level: "review", code: "unconfirmed-selected-group-authority", message: "Авторы изменений групп проверены только по наличию ID. Исторические полномочия и ранний состав групп требуют независимого источника." });
  }
  if (subjects) {
    for (const event of subjects.history) {
      await step(); const id = path("subject-history", event.id);
      reference("subjects", id, "account", event.actorId); timestamp("subjects", id, event.occurredAt);
      if (event.origin === "saved-snapshot") issue({ kind: "subjects", level: "review", code: "legacy-selected-subject-snapshot", recordId: id, referenceId: event.subjectId, message: "Ранние реквизиты дисциплины сохранены снимком. Он не подтверждает отсутствующую историю до первого зафиксированного изменения." });
    }
    if (subjects.history.length) issue({ kind: "subjects", level: "review", code: "unconfirmed-selected-subject-authority", message: "Наличие автора изменения дисциплины не подтверждает его исторические полномочия." });
  }
  if (schedule) {
    const lesson = (recordId: string, value: ManagedLesson) => {
      reference("schedule", recordId, "group", value.groupId); reference("schedule", recordId, "subject", value.subjectId); reference("schedule", recordId, "account", value.teacherId);
    };
    for (const [mode, weeks] of [["draft", schedule.drafts], ["published", schedule.published]] as const) for (const week of weeks) {
      await step(); const id = path(mode, week.groupId, week.weekStart);
      reference("schedule", id, "group", week.groupId);
      if (week.updatedBy) reference("schedule", path("week-updated", mode, week.groupId, week.weekStart), "account", week.updatedBy);
      if (week.publishedBy) reference("schedule", path("week-published", mode, week.groupId, week.weekStart), "account", week.publishedBy);
      timestamp("schedule", path("week-updated", mode, week.groupId, week.weekStart), week.updatedAt);
      timestamp("schedule", path("week-published", mode, week.groupId, week.weekStart), week.publishedAt);
      for (const value of week.lessons) { await step(); lesson(path(mode, value.id), value); }
    }
    for (const value of schedule.journal) { await step(); lesson(path("journal", value.id, value.subjectId, value.groupId), value); }
    for (const publication of schedule.publications ?? []) {
      await step(); reference("schedule", path("publication", publication.id), "group", publication.week.groupId);
      for (const value of publication.week.lessons) { await step(); reference("schedule", path("publication-lesson", publication.id, value.id), "group", value.groupId); }
    }
    for (const finding of await inspectArchivedSchedulePublications(schedule, { accountIds, groupIds, subjectIds }, checkedAt, signal)) issue(finding);
    for (const finding of (await inspectArchivedScheduleConflicts(schedule, signal, rooms)).issues) issue(finding);
  }
  for (const finding of (await inspectArchivedGroupStates(groups, accounts, schedule, checkedAt, signal)).issues) issue(finding);
  for (const finding of (await inspectArchivedGroupHistory(groups, signal)).issues) issue(finding);
  for (const finding of (await inspectArchivedSubjectStates(subjects, { accounts, schedule, assessments }, checkedAt, signal)).issues) issue(finding);
  checkBackupAbort(signal);
}
