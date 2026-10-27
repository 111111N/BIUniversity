import { queryGroupComposition, type GroupCompositionQuery, type GroupCompositionSnapshot } from "../domain/groupComposition";
import { appendEducationChange, confirmStudentAdmission, educationStateFor, type ConfirmAdmissionCommand } from "../domain/studentEducation";
import type { EducationEventDetails, StudentEducationEvent } from "../domain/studentEducationEvent";
import { ACADEMIC_GROUPS, SUBJECTS, SUBJECT_GROUP_OFFERINGS, refreshAcademicCatalog, getAcademicGroupNameAt } from "./academicCatalog";
import { executeAdministrationWrite } from "./administrationWrite";
import { authorizeAccountCommand, changeAccountRole, changeAccountStatus, createAccount, decodeAccountsDocument, getStudentGroupId, issueStudentRecord, updateAccountDetails, updateTeacherAssignments, type AccountTargetCommand, type UpdateAccountDetailsCommand, type UpdateAssignmentsCommand, type AccountCommandContext, type AccountDraft, type AccountsDocument, type AcademicMembership, type PortalAccount, type UserRole } from "../domain/accounts";
import { previewStudentNumber, type StudentNumberPreview } from "../domain/studentRecord";
import { applyStudentImport, previewStudentImport, studentImportSourceKey, type ApplyStudentImportCommand, type StudentImportPreview, type StudentImportRequest } from "../domain/studentImport";
import type { StudentImportReceipt } from "../domain/studentImportReceipt";
import { readGroupCatalogDocument } from "./groupCatalogRead";
import { MAX_IMPORT_ROWS } from "../domain/importTable";
import { isGroupActive } from "../domain/groupCatalog";
import { isStudyingStudent } from "../domain/studentEnrollment";
import { queryStudentRegistry, type StudentRegistryQuery, type StudentRegistryResult } from "../domain/studentRegistry";
import { queryTeacherRegistry, type TeacherRegistryQuery, type TeacherRegistryResult } from "../domain/teacherRegistry";
import { applyStudentBulk, studentBulkSourceKey, type ApplyStudentBulkCommand, type StudentBulkPreview, type StudentBulkRequest } from "../domain/studentBulk";
import type { StudentBulkAction, StudentBulkReceipt } from "../domain/studentBulkReceipt";
import { previewStudentBulk } from "../domain/studentBulk";

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
export const readAccountsState = (): { accounts: PortalAccount[]; history: AccountsDocument["history"]; studentImports: StudentImportReceipt[]; studentOperations: StudentBulkReceipt[]; educationEvents: StudentEducationEvent[]; revision: number; error: string } => {
  try { const state = readDocument(); return { accounts: state.accounts, history: state.history, studentImports: state.studentImports ?? [], studentOperations: state.studentOperations ?? [], educationEvents: state.educationEvents ?? [], revision: state.revision, error: "" }; }
  catch (error) { console.error("Не удалось прочитать учётные записи. Исходное хранилище не изменено:", error); return { accounts: [], history: [], studentImports: [], studentOperations: [], educationEvents: [], revision: 0, error: "Не удалось прочитать учётные записи. Исходные данные не изменены; создание и изменение приостановлены." }; }
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
const validateAssignments = (memberships: AcademicMembership[], retained: AcademicMembership[] = []) => {
  const catalog = refreshAcademicCatalog();
  if (catalog.error) throw new Error(catalog.error);
  if (memberships.some((entry) => entry.groupIds.some((groupId) => !ACADEMIC_GROUPS.some((group) => group.id === groupId && (isGroupActive(group) || retained.some((previous) => previous.subjectId === entry.subjectId && previous.groupIds.includes(groupId)))) || !SUBJECT_GROUP_OFFERINGS.some((offering) => offering.subjectId === entry.subjectId && offering.groupId === groupId)))) throw new Error("Выбрано недоступное сочетание предмета и группы. Архивные группы недоступны для назначений.");
};
const saveDocument = (state: AccountsDocument) => { localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(state)); window.dispatchEvent(new Event(CHANGE_EVENT)); };
const validateStudentGroup = (account: PortalAccount, previous?: PortalAccount) => {
  if (account.role !== "student") return;
  const catalog = refreshAcademicCatalog();
  if (catalog.error) throw new Error(catalog.error);
  if (!ACADEMIC_GROUPS.some((group) => group.id === getStudentGroupId(account))) throw new Error("Учебная группа студента не найдена. Выберите существующую группу.");
  if (!isGroupActive(ACADEMIC_GROUPS.find((group) => group.id === getStudentGroupId(account))!) && (!previous || getStudentGroupId(previous) !== getStudentGroupId(account) || isStudyingStudent(account))) throw new Error("Группа в архиве. Для зачисления или возобновления обучения выберите действующую группу.");
};
export interface AccountService {
  listTeachers(command: { actorId: string; actorRevision: number; query: TeacherRegistryQuery }): Promise<TeacherRegistryResult>;
  getGroupComposition(command: { actorId: string; actorRevision: number; query: GroupCompositionQuery }): Promise<GroupCompositionSnapshot>;
  confirmAdmission(command: ConfirmAdmissionCommand): Promise<PortalAccount>;
  listStudents(query: StudentRegistryQuery): Promise<StudentRegistryResult>;
  previewStudentOperation(command: { actorId: string; actorRevision: number; accountIds: string[]; action: StudentBulkAction; education?: EducationEventDetails }): Promise<StudentBulkPreview>;
  applyStudentOperation(command: ApplyStudentBulkCommand): Promise<{ receipt: StudentBulkReceipt; replayed: boolean }>;
  list(): Promise<{ accounts: PortalAccount[]; revision: number }>;
  create(command: AccountCommandContext & { draft: AccountDraft; expectedStudentNumber?: string }): Promise<PortalAccount>;
  changeRole(command: AccountCommandContext & { accountId: string; accountRevision: number; role: UserRole; memberships: AcademicMembership[]; studentGroupId?: string; studentCampus?: number; expectedStudentNumber?: string }): Promise<PortalAccount>;
  updateAssignments(command: UpdateAssignmentsCommand): Promise<PortalAccount>;
  previewStudentNumber(command: { actorId: string; actorRevision: number; campus: number }): Promise<StudentNumberPreview>;
  updateDetails(command: UpdateAccountDetailsCommand): Promise<PortalAccount>;
  changeStatus(command: AccountTargetCommand & { status: "active" | "blocked" }): Promise<PortalAccount>;
  issueStudentRecord(command: AccountTargetCommand & { campus: number; expectedStudentNumber: string }): Promise<PortalAccount>;
  previewStudentsImport(command: { actorId: string; actorRevision: number; request: StudentImportRequest }): Promise<StudentImportPreview>;
  importStudents(command: ApplyStudentImportCommand): Promise<{ receipt: StudentImportReceipt; replayed: boolean }>;
}
const fingerprintSource = async (source: string) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const importFingerprint = (request: StudentImportRequest) => fingerprintSource(studentImportSourceKey(request));
export const accountService: AccountService = {
  async listTeachers(command) {
    try {
      const state = readDocument();
      authorizeAccountCommand(state, { ...command, expectedRevision: state.revision });
      if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Реестр преподавателей временно недоступен.");
      return queryTeacherRegistry(state.accounts, SUBJECTS, ACADEMIC_GROUPS, command.query);
    } catch (error) { console.error("Не удалось прочитать реестр преподавателей:", error); throw error; }
  },
  async getGroupComposition(command) {
    try {
      const input = structuredClone(command);
      const state = readDocument(); authorizeAccountCommand(state, { ...input, expectedRevision: state.revision });
      if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Состав группы временно недоступен.");
      const result = queryGroupComposition(state.accounts, state.educationEvents ?? [], ACADEMIC_GROUPS, input.query);
      return { ...result, accountsRevision: state.revision, groupRevision: readGroupCatalogDocument().revision, groupNameAtDate: getAcademicGroupNameAt(input.query.groupId, input.query.date + "T23:59:59.999+03:00") };
    } catch (error) { console.error("Не удалось прочитать состав группы на дату:", error); throw error; }
  },
  async confirmAdmission(command) {
    return executeAdministrationWrite(() => {
      try { if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен."); const next = confirmStudentAdmission(readDocument(), command, ACADEMIC_GROUPS, readGroupCatalogDocument().revision, crypto.randomUUID(), new Date().toISOString()); saveDocument(next); return next.accounts.find((account) => account.id === command.accountId)!; }
      catch (error) { console.error("Не удалось подтвердить зачисление студента:", error); throw error; }
    });
  },
  async listStudents(query) {
    try { if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Реестр студентов временно недоступен."); return queryStudentRegistry(readDocument().accounts, ACADEMIC_GROUPS, query); }
    catch (error) { console.error("Не удалось прочитать реестр студентов:", error); throw error; }
  },
  async previewStudentOperation(command) {
    try {
      const input = structuredClone(command);
      if (!Array.isArray(input.accountIds)) throw new Error("Выберите студентов для действия.");
      if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Изменение студентов приостановлено.");
      const state = readDocument(); authorizeAccountCommand(state, { ...input, expectedRevision: state.revision });
      const byId = new Map(state.accounts.map((account) => [account.id, account]));
      const request: StudentBulkRequest = { targets: input.accountIds.map((id) => ({ accountId: id, revision: byId.get(id)?.revision ?? 0 })), action: input.action, ...(input.education !== undefined ? { education: input.education } : {}) };
      const source = studentBulkSourceKey(request);
      const plan = previewStudentBulk(state, ACADEMIC_GROUPS, request);
      const groupRevision = readGroupCatalogDocument().revision;
      return { ...plan, request, fingerprint: await fingerprintSource(source), expectedRevision: state.revision, groupRevision, actorRevision: input.actorRevision };
    } catch (error) { console.error("Не удалось подготовить массовое действие над студентами:", error); throw error; }
  },
  async applyStudentOperation(command) {
    try {
      const input = structuredClone(command);
      if (await fingerprintSource(studentBulkSourceKey(input.request)) !== input.fingerprint) throw new Error("Выбранные записи или действие изменились. Проверьте предпросмотр заново.");
      return await executeAdministrationWrite(() => {
        if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Изменение студентов приостановлено.");
        const outcome = applyStudentBulk(readDocument(), input, ACADEMIC_GROUPS, readGroupCatalogDocument().revision, new Date().toISOString(), input.request.targets.map(() => crypto.randomUUID()));
        if (!outcome.replayed) saveDocument(outcome.state);
        return { receipt: outcome.receipt, replayed: outcome.replayed };
      });
    } catch (error) { console.error("Не удалось применить массовое действие над студентами. Частичная запись не выполнена:", error); throw error; }
  },
  async previewStudentsImport(command) {
    try {
      const request = structuredClone(command.request);
      const fingerprint = await importFingerprint(request);
      const state = readDocument();
      authorizeAccountCommand(state, { ...command, expectedRevision: state.revision });
      if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Импорт приостановлен.");
      const groupRevision = readGroupCatalogDocument().revision;
      return { ...previewStudentImport(state, ACADEMIC_GROUPS, request, new Date().toISOString()), fingerprint, expectedRevision: state.revision, actorRevision: command.actorRevision, groupRevision, previousImport: state.studentImports?.find((receipt) => receipt.fingerprint === fingerprint) };
    } catch (error) { console.error("Не удалось подготовить импорт студентов:", error); throw error; }
  },
  async importStudents(command) {
    try {
      const request = structuredClone(command);
      if (await importFingerprint(request.request) !== request.fingerprint) throw new Error("Список изменился после предпросмотра. Проверьте его заново.");
      if (!Array.isArray(request.expectedStudentNumbers) || request.expectedStudentNumbers.length > MAX_IMPORT_ROWS || request.expectedStudentNumbers.some((number) => typeof number !== "string")) throw new Error("Предпросмотр номеров недоступен. Проверьте список заново.");
      return await executeAdministrationWrite(() => {
        const state = readDocument();
        if (refreshAcademicCatalog().error) throw new Error("Учебный каталог недоступен. Импорт приостановлен.");
        const plan = applyStudentImport(state, request, ACADEMIC_GROUPS, readGroupCatalogDocument().revision, new Date().toISOString(), request.expectedStudentNumbers.map(() => ({ id: crypto.randomUUID(), changeId: crypto.randomUUID() })));
        if (!plan.replayed) saveDocument(plan.state);
        return { receipt: plan.receipt, replayed: plan.replayed };
      });
    } catch (error) { console.error("Не удалось применить импорт студентов. Пакет не записан частично:", error); throw error; }
  },
  async list() {
    try { const state = readDocument(); return { accounts: state.accounts, revision: state.revision }; }
    catch (error) { console.error("Не удалось загрузить список учётных записей:", error); throw error; }
  },
  async previewStudentNumber(command) {
    try { const state = readDocument(); authorizeAccountCommand(state, { ...command, expectedRevision: state.revision }); return previewStudentNumber(state, command.campus, new Date().toISOString()); }
    catch (error) { console.error("Не удалось получить следующий номер зачетки:", error); throw error; }
  },
  async updateDetails(command) {
    return executeAdministrationWrite(() => {
      try { const state = readDocument(); const previous = state.accounts.find((entry) => entry.id === command.accountId); if (command.details.memberships) validateAssignments(command.details.memberships, previous?.memberships); const auditId = crypto.randomUUID(); const registeredAt = new Date().toISOString(); let next = updateAccountDetails(state, command, auditId, registeredAt); const updated = next.accounts.find((entry) => entry.id === command.accountId)!; validateStudentGroup(updated, previous); if (previous?.role === "student" && (getStudentGroupId(previous) !== getStudentGroupId(updated) || (previous.enrollmentStatus ?? "studying") !== (updated.enrollmentStatus ?? "studying"))) next = appendEducationChange(next, updated.id, educationStateFor(previous, ACADEMIC_GROUPS), educationStateFor(updated, ACADEMIC_GROUPS), command.education, auditId, registeredAt); saveDocument(next); return updated; }
      catch (error) { console.error("Не удалось обновить данные учётной записи:", error); throw error; }
    });
  },
  async changeStatus(command) {
    return executeAdministrationWrite(() => {
      try { const next = changeAccountStatus(readDocument(), command, crypto.randomUUID(), new Date().toISOString()); saveDocument(next); return next.accounts.find((entry) => entry.id === command.accountId)!; }
      catch (error) { console.error("Не удалось изменить доступ учётной записи:", error); throw error; }
    });
  },
  async issueStudentRecord(command) {
    return executeAdministrationWrite(() => {
      try { const next = issueStudentRecord(readDocument(), command, crypto.randomUUID(), new Date().toISOString()); saveDocument(next); return next.accounts.find((entry) => entry.id === command.accountId)!; }
      catch (error) { console.error("Не удалось выдать номер зачетки:", error); throw error; }
    });
  },
  async create(command) {
    return executeAdministrationWrite(async () => {
      try {
        const state = readDocument(); validateAssignments(command.draft.memberships);
        const id = crypto.randomUUID();
        const next = createAccount(state, command, id, crypto.randomUUID(), new Date().toISOString());
        validateStudentGroup(next.accounts.find((account) => account.id === id)!);
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
        validateStudentGroup(next.accounts.find((entry) => entry.id === command.accountId)!);
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
