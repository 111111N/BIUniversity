import { ACADEMIC_GROUPS, SUBJECT_GROUP_OFFERINGS, refreshAcademicCatalog } from "./academicCatalog";
import { executeAdministrationWrite } from "./administrationWrite";
import { changeAccountRole, createAccount, decodeAccountsDocument, updateTeacherAssignments, type UpdateAssignmentsCommand, type AccountCommandContext, type AccountDraft, type AccountsDocument, type AcademicMembership, type PortalAccount, type UserRole } from "../domain/accounts";

export const ACCOUNTS_STORAGE_KEY = "bi-university-accounts-v1";
const CHANGE_EVENT = "bi-university-accounts-change";
const teacherMemberships = ["theory-of-probability", "mathematical-statistics", "data-analysis", "discrete-mathematics"].map((subjectId) => ({ subjectId, groupIds: SUBJECT_GROUP_OFFERINGS.filter((entry) => entry.subjectId === subjectId).map((entry) => entry.groupId) }));
export const createInitialAccountsDocument = (): AccountsDocument => ({ version: 1, revision: 0, history: [], accounts: [
  { id: "teacher-elena-volkova", name: "Елена Волкова", role: "teacher", login: "elena.volkova", scheduleName: "Волкова Е.В.", memberships: teacherMemberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })), revision: 1 },
  { id: "anna-smirnova", name: "Анна Смирнова", role: "student", login: "anna.smirnova", memberships: SUBJECT_GROUP_OFFERINGS.filter((entry) => entry.groupId === "112-mko").map((entry) => ({ subjectId: entry.subjectId, groupIds: [entry.groupId] })), revision: 1 },
  { id: "configurator-demo", name: "Настройщик системы", role: "configurator", login: "configurator", memberships: [], revision: 1 },
] });

const readDocument = (): AccountsDocument => {
  const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  return raw === null ? createInitialAccountsDocument() : decodeAccountsDocument(raw);
};
export const readAccountsState = (): { accounts: PortalAccount[]; revision: number; error: string } => {
  try { const state = readDocument(); return { accounts: state.accounts, revision: state.revision, error: "" }; }
  catch (error) { console.error("Не удалось прочитать учётные записи. Исходное хранилище не изменено:", error); return { accounts: [], revision: 0, error: "Не удалось прочитать учётные записи. Исходные данные не изменены; создание и изменение приостановлены." }; }
};
export const subscribeAccounts = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => { if (event.key === ACCOUNTS_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
};
const roleGuards = new Set<(account: PortalAccount, nextRole: UserRole) => void | Promise<void>>();
export const registerAccountRoleChangeGuard = (guard: (account: PortalAccount, nextRole: UserRole) => void | Promise<void>) => { roleGuards.add(guard); return () => { roleGuards.delete(guard); }; };
const assignmentGuards = new Set<(account: PortalAccount, nextMemberships: AcademicMembership[]) => void | Promise<void>>();
export const registerTeachingAssignmentGuard = (guard: (account: PortalAccount, nextMemberships: AcademicMembership[]) => void | Promise<void>) => { assignmentGuards.add(guard); return () => { assignmentGuards.delete(guard); }; };
const validateAssignments = (memberships: AcademicMembership[]) => {
  const catalog = refreshAcademicCatalog();
  if (catalog.error) throw new Error(catalog.error);
  if (memberships.some((entry) => entry.groupIds.some((groupId) => !ACADEMIC_GROUPS.some((group) => group.id === groupId) || !SUBJECT_GROUP_OFFERINGS.some((offering) => offering.subjectId === entry.subjectId && offering.groupId === groupId)))) throw new Error("Выбрано недоступное сочетание предмета и группы.");
};
const saveDocument = (state: AccountsDocument) => { localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(state)); window.dispatchEvent(new Event(CHANGE_EVENT)); };
export interface AccountService {
  list(): Promise<{ accounts: PortalAccount[]; revision: number }>;
  create(command: AccountCommandContext & { draft: AccountDraft }): Promise<PortalAccount>;
  changeRole(command: AccountCommandContext & { accountId: string; accountRevision: number; role: UserRole; memberships: AcademicMembership[] }): Promise<PortalAccount>;
  updateAssignments(command: UpdateAssignmentsCommand): Promise<PortalAccount>;
}
export const accountService: AccountService = {
  async list() {
    try { const state = readDocument(); return { accounts: state.accounts, revision: state.revision }; }
    catch (error) { console.error("Не удалось загрузить список учётных записей:", error); throw error; }
  },
  async create(command) {
    return executeAdministrationWrite(async () => {
      try {
        const state = readDocument(); validateAssignments(command.draft.memberships);
        const id = crypto.randomUUID();
        const next = createAccount(state, command, id, crypto.randomUUID(), new Date().toISOString());
        saveDocument(next); return next.accounts.find((account) => account.id === id)!;
      } catch (error) { console.error("Не удалось создать учётную запись:", error); throw error; }
    });
  },
  async changeRole(command) {
    return executeAdministrationWrite(async () => {
      try {
        const state = readDocument(); validateAssignments(command.memberships);
        changeAccountRole(state, command, "validation", new Date().toISOString());
        const account = state.accounts.find((entry) => entry.id === command.accountId)!;
        for (const guard of roleGuards) await guard(account, command.role);
        // A guard may await another service; reauthorize against the latest document before writing.
        validateAssignments(command.memberships);
        const next = changeAccountRole(readDocument(), command, crypto.randomUUID(), new Date().toISOString());
        saveDocument(next); return next.accounts.find((entry) => entry.id === command.accountId)!;
      } catch (error) { console.error("Не удалось изменить тип учётной записи:", error); throw error; }
    });
  },
  async updateAssignments(command) {
    return executeAdministrationWrite(async () => {
      try {
        const state = readDocument(); validateAssignments(command.memberships);
        updateTeacherAssignments(state, command, "validation", new Date().toISOString());
        const account = state.accounts.find((entry) => entry.id === command.accountId)!;
        for (const guard of assignmentGuards) await guard(account, command.memberships);
        validateAssignments(command.memberships);
        const next = updateTeacherAssignments(readDocument(), command, crypto.randomUUID(), new Date().toISOString());
        saveDocument(next); return next.accounts.find((entry) => entry.id === command.accountId)!;
      } catch (error) { console.error("Не удалось изменить учебные назначения преподавателя:", error); throw error; }
    });
  },
};
