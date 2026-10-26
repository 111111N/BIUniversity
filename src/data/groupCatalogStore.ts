import { authorizeGroupTarget, changeAcademicGroupStatus, createAcademicGroup, groupArchiveBlockers, updateAcademicGroup, type ChangeGroupStatusCommand, type CreateGroupCommand, type GroupCatalogDocument, type GroupDependencies, type GroupTargetCommand, type ManagedGroup, type UpdateGroupCommand } from "../domain/groupCatalog";
import { ACADEMIC_GROUPS, DEMO_GROUPS, refreshAcademicCatalog, SUBJECT_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_STORAGE_KEY, type AcademicGroup } from "./academicCatalog";
import { readAccountsState } from "./accountStore";
import { executeAdministrationWrite } from "./administrationWrite";
import { GROUP_CATALOG_CHANGE_EVENT, GROUP_CATALOG_STORAGE_KEY, readGroupCatalogDocument } from "./groupCatalogRead";
import { getStudentGroupId } from "../domain/accounts";
import { readManagedScheduleState } from "./managedScheduleStore";
import type { ManagedScheduleSnapshot } from "../domain/scheduleManagement";
import { isStudyingStudent } from "../domain/studentEnrollment";

export { GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
export interface GroupCatalogRead { groups: AcademicGroup[]; managed: ManagedGroup[]; revision: number; history: GroupCatalogDocument["history"]; error: string }
export const readGroupCatalogState = (): GroupCatalogRead => {
  try {
    const catalogue = refreshAcademicCatalog();
    if (catalogue.error) throw new Error(catalogue.error);
    const state = readGroupCatalogDocument();
    return { groups: [...ACADEMIC_GROUPS], managed: state.groups, revision: state.revision, history: state.history, error: "" };
  } catch (error) {
    console.error("Не удалось прочитать справочник групп. Исходные данные сохранены:", error);
    return { groups: [...DEMO_GROUPS], managed: [], revision: 0, history: [], error: "Справочник групп недоступен. Исходные данные сохранены, изменения приостановлены." };
  }
};
export const subscribeGroupCatalog = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => { if (event.key === GROUP_CATALOG_STORAGE_KEY || event.key === SUBJECT_CATALOG_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener(GROUP_CATALOG_CHANGE_EVENT, listener);
  window.addEventListener(SUBJECT_CATALOG_CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(GROUP_CATALOG_CHANGE_EVENT, listener); window.removeEventListener(SUBJECT_CATALOG_CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
};
export interface GroupStatusPreview extends GroupTargetCommand { dependencies: GroupDependencies; blockers: string[]; expectedAccountsRevision: number; expectedScheduleRevision: number }
const readWriteContext = () => {
  if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Изменение группы остановлено.");
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  return { accounts, document: readGroupCatalogDocument() };
};
const dependenciesFor = (groupId: string, accounts: ReturnType<typeof readAccountsState>["accounts"], schedule: ManagedScheduleSnapshot): GroupDependencies => {
  const now = Date.now();
  const lessons = schedule.published.filter((week) => week.groupId === groupId).flatMap((week) => week.lessons);
  return {
    students: accounts.filter((account) => getStudentGroupId(account) === groupId && isStudyingStudent(account)).length,
    teachingAssignments: accounts.reduce((count, account) => count + (account.role === "teacher" ? account.memberships.filter((entry) => entry.groupIds.includes(groupId)).length : 0), 0),
    draftLessons: schedule.drafts.filter((week) => week.groupId === groupId).reduce((count, week) => count + week.lessons.length, 0),
    futurePublishedLessons: lessons.filter((lesson) => Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) > now).length,
    pastPublishedLessons: lessons.filter((lesson) => Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) <= now).length,
  };
};
const saveGroupDocument = (document: GroupCatalogDocument, groupId: string) => {
  localStorage.setItem(GROUP_CATALOG_STORAGE_KEY, JSON.stringify(document));
  refreshAcademicCatalog(); window.dispatchEvent(new Event(GROUP_CATALOG_CHANGE_EVENT));
  return document.groups.find((group) => group.id === groupId)!;
};
export interface GroupCatalogService {
  list(): Promise<GroupCatalogRead>;
  create(command: CreateGroupCommand): Promise<ManagedGroup>;
  update(command: UpdateGroupCommand): Promise<ManagedGroup>;
  previewStatus(command: GroupTargetCommand): Promise<GroupStatusPreview>;
  changeStatus(command: ChangeGroupStatusCommand): Promise<ManagedGroup>;
}
export const groupCatalogService: GroupCatalogService = {
  list: async () => readGroupCatalogState(),
  create: async (command) => executeAdministrationWrite(() => {
    try {
      if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Создание группы остановлено.");
      const accounts = readAccountsState();
      if (accounts.error) throw new Error(accounts.error);
      const next = createAcademicGroup(readGroupCatalogDocument(), command, accounts.accounts.find((account) => account.id === command.actorId), DEMO_GROUPS, `group-${crypto.randomUUID()}`, crypto.randomUUID(), new Date().toISOString());
      localStorage.setItem(GROUP_CATALOG_STORAGE_KEY, JSON.stringify(next));
      refreshAcademicCatalog();
      window.dispatchEvent(new Event(GROUP_CATALOG_CHANGE_EVENT));
      return next.groups.at(-1)!;
    } catch (error) { console.error("Не удалось создать учебную группу:", error); throw error; }
  }),
  update: async (command) => executeAdministrationWrite(() => {
    try {
      const { accounts, document } = readWriteContext();
      const next = updateAcademicGroup(document, command, accounts.accounts.find((account) => account.id === command.actorId), DEMO_GROUPS, crypto.randomUUID(), new Date().toISOString());
      return saveGroupDocument(next, command.groupId);
    } catch (error) { console.error("Не удалось изменить реквизиты учебной группы:", error); throw error; }
  }),
  previewStatus: async (command) => {
    try {
      const { accounts, document } = readWriteContext();
      authorizeGroupTarget(document, command, accounts.accounts.find((account) => account.id === command.actorId), DEMO_GROUPS);
      const schedule = readManagedScheduleState();
      if (schedule.error) throw new Error("Проверка зависимостей группы недоступна: восстановите расписание.");
      const dependencies = dependenciesFor(command.groupId, accounts.accounts, schedule.snapshot);
      return { ...command, dependencies, blockers: groupArchiveBlockers(dependencies), expectedAccountsRevision: accounts.revision, expectedScheduleRevision: schedule.snapshot.revision };
    } catch (error) { console.error("Не удалось проверить зависимости учебной группы:", error); throw error; }
  },
  changeStatus: async (command) => executeAdministrationWrite(() => {
    try {
      const { accounts, document } = readWriteContext();
      const schedule = readManagedScheduleState();
      if (schedule.error) throw new Error("Проверка зависимостей группы недоступна: восстановите расписание.");
      if (accounts.revision !== command.expectedAccountsRevision || schedule.snapshot.revision !== command.expectedScheduleRevision) throw new Error("Состав, назначения или расписание изменились. Обновите проверку перед изменением состояния группы.");
      const next = changeAcademicGroupStatus(document, command, accounts.accounts.find((account) => account.id === command.actorId), DEMO_GROUPS, dependenciesFor(command.groupId, accounts.accounts, schedule.snapshot), crypto.randomUUID(), new Date().toISOString());
      return saveGroupDocument(next, command.groupId);
    } catch (error) { console.error("Не удалось изменить состояние учебной группы:", error); throw error; }
  }),
};
