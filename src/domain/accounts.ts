import { allocateStudentNumber, isStudentRecord, type StudentRecord } from "./studentRecord";
import { isStudentImportReceipt, type StudentImportReceipt } from "./studentImportReceipt";
import { isStudentEnrollmentStatus, type StudentEnrollmentStatus } from "./studentEnrollment";
import { isStudentBulkReceipt, type StudentBulkReceipt } from "./studentBulkReceipt";
import { isStudentEducationEvent, sameEducationState, type StudentEducationEvent, type EducationEventDetails } from "./studentEducationEvent";

export type UserRole = "teacher" | "student" | "configurator";
export type AcademicMembership = { subjectId: string; groupIds: string[] };
export type CurrentUser = { id: string; name: string; role: UserRole; scheduleName?: string; memberships: AcademicMembership[]; status?: "active" | "blocked"; email?: string; studentRecord?: StudentRecord; studentGroupId?: string; enrollmentStatus?: StudentEnrollmentStatus };
export type PortalAccount = CurrentUser & { login: string; revision: number; createdAt?: string; updatedAt?: string };
export type AccountDraft = { name: string; login: string; role: UserRole; memberships: AcademicMembership[]; scheduleName?: string; email?: string; studentCampus?: number; studentGroupId?: string; enrollmentStatus?: StudentEnrollmentStatus };
export type AccountFieldChange = { field: string; before: string; after: string };
export type AccountChange = { id: string; actorId: string; accountId: string; occurredAt: string; action: "created" | "role-changed" | "assignments-changed" | "details-changed" | "status-changed" | "student-number-issued"; previousRole: UserRole | null; nextRole: UserRole; previousMemberships?: AcademicMembership[]; nextMemberships?: AcademicMembership[]; changes?: AccountFieldChange[]; importBatchId?: string; studentOperationBatchId?: string; educationEventId?: string };
export type AccountsDocument = { version: 1; revision: number; accounts: PortalAccount[]; history: AccountChange[]; studentNumberCounters?: Record<string, number>; studentImports?: StudentImportReceipt[]; studentOperations?: StudentBulkReceipt[]; educationEvents?: StudentEducationEvent[] };
export type AccountCommandContext = { actorId: string; actorRevision: number; expectedRevision: number };

export const ACCOUNT_ROLE_LABELS: Record<UserRole, string> = { teacher: "Преподаватель", student: "Студент", configurator: "Настройщик" };
export const isUserRole = (value: unknown): value is UserRole => value === "teacher" || value === "student" || value === "configurator";
export const isAccountActive = (account: Pick<CurrentUser, "status">) => account.status !== "blocked";
type AccessAccount = Pick<CurrentUser, "id" | "role" | "status">;
export const getAccountBlockRestriction = (account: AccessAccount, actorId: string, accounts: readonly AccessAccount[]) => {
  if (account.id === actorId) return "Нельзя заблокировать свою текущую учётную запись.";
  if (account.role === "configurator" && accounts.filter((entry) => entry.role === "configurator" && isAccountActive(entry)).length <= 1) return "Нельзя заблокировать последнего активного настройщика.";
  return "";
};
export const getAccountRoleRestriction = (account: AccessAccount, nextRole: UserRole, accounts: readonly AccessAccount[]) => account.role === "configurator" && isAccountActive(account) && nextRole !== "configurator" && accounts.filter((entry) => entry.role === "configurator" && isAccountActive(entry)).length <= 1
  ? "Нельзя изменить тип последнего настройщика. Сначала создайте другого активного настройщика." : "";
export const normalizeAccountLogin = (login: string) => login.normalize("NFKC").trim().toLowerCase();
/** Legacy accounts infer enrolment from their single group; new accounts store it independently. */
export const getStudentGroupId = (account: Pick<CurrentUser, "role" | "memberships" | "studentGroupId">) => {
  if (account.role !== "student") return undefined;
  if (account.studentGroupId) return account.studentGroupId;
  const groups = [...new Set(account.memberships.flatMap((entry) => entry.groupIds))];
  return groups.length === 1 ? groups[0] : undefined;
};
export const countRegisteredStudentsByGroup = (accounts: CurrentUser[]) => {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const group = getStudentGroupId(account);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
};

export type AccountIdentityField = "name" | "login" | "email";
export interface AccountIdentityProblem { field: AccountIdentityField; message: string }
const accountNameProblem = (name: string) => name.length < 2 || name.length > 120 ? "Укажите имя длиной от 2 до 120 символов." : "";
const accountLoginProblem = (login: string, accounts: readonly PortalAccount[], excludedId?: string) => {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login)) return "Логин: 3–64 латинских символа, цифры, точка, дефис или подчёркивание.";
  return accounts.some((account) => account.id !== excludedId && normalizeAccountLogin(account.login) === login) ? "Этот логин уже занят." : "";
};
const accountEmailProblem = (email: string | undefined) => email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ? "Укажите корректную электронную почту." : "";

export const getAccountIdentityErrors = (draft: Pick<AccountDraft, AccountIdentityField>, accounts: readonly PortalAccount[], excludedId?: string): AccountIdentityProblem[] => {
  const problems = [
    { field: "name" as const, message: accountNameProblem(draft.name.trim().replace(/\s+/g, " ")) },
    { field: "login" as const, message: accountLoginProblem(normalizeAccountLogin(draft.login), accounts, excludedId) },
    { field: "email" as const, message: accountEmailProblem(draft.email?.trim().toLowerCase() || undefined) },
  ];
  return problems.filter((problem) => problem.message);
};
export const getMissingStudentGroupProblem = (draft: Pick<AccountDraft, "role" | "memberships" | "studentGroupId">) => draft.role === "student" && !draft.memberships.length && !draft.studentGroupId ? "Выберите учебную группу студента." : "";

export const validateAccountDraft = (draft: AccountDraft, accounts: PortalAccount[], excludedId?: string) => {
  const name = draft.name.trim().replace(/\s+/g, " ");
  const login = normalizeAccountLogin(draft.login);
  const nameProblem = accountNameProblem(name);
  if (nameProblem) throw new Error(nameProblem);
  const loginProblem = accountLoginProblem(login, accounts, excludedId);
  if (loginProblem) throw new Error(loginProblem);
  if (!isUserRole(draft.role)) throw new Error("Выберите корректный тип учётной записи.");
  if (draft.enrollmentStatus !== undefined && !isStudentEnrollmentStatus(draft.enrollmentStatus)) throw new Error("Выберите корректное состояние обучения.");
  if (!Array.isArray(draft.memberships) || draft.memberships.some((entry) => !entry.subjectId || !Array.isArray(entry.groupIds) || !entry.groupIds.length || entry.groupIds.some((id) => !id))) throw new Error("Проверьте учебные назначения.");
  if (draft.studentGroupId !== undefined && (typeof draft.studentGroupId !== "string" || !draft.studentGroupId.trim() || draft.studentGroupId !== draft.studentGroupId.trim())) throw new Error("Проверьте учебную группу студента.");
  const missingGroupProblem = getMissingStudentGroupProblem(draft);
  if (missingGroupProblem) throw new Error(missingGroupProblem);
  const studentGroups = new Set([...draft.memberships.flatMap((entry) => entry.groupIds), ...(draft.studentGroupId ? [draft.studentGroupId] : [])]);
  if (draft.role === "student" && studentGroups.size !== 1) throw new Error("Студент должен состоять в одной учебной группе.");
  if (draft.role === "configurator" && draft.memberships.length) throw new Error("Настройщику не требуются учебные назначения.");
  if (new Set(draft.memberships.map((entry) => entry.subjectId)).size !== draft.memberships.length || draft.memberships.some((entry) => new Set(entry.groupIds).size !== entry.groupIds.length)) throw new Error("Учебные назначения не должны повторяться.");
  const email = draft.email?.trim().toLowerCase() || undefined;
  const emailProblem = accountEmailProblem(email);
  if (emailProblem) throw new Error(emailProblem);
  return { name, login, role: draft.role, email, studentGroupId: draft.role === "student" ? draft.studentGroupId : undefined, ...(draft.enrollmentStatus !== undefined ? { enrollmentStatus: draft.enrollmentStatus } : {}), memberships: draft.memberships.map((entry) => ({ subjectId: entry.subjectId, groupIds: [...entry.groupIds] })), scheduleName: draft.scheduleName?.trim() || undefined };
};

export const authorizeAccountCommand = (state: AccountsDocument, command: AccountCommandContext) => {
  const actor = state.accounts.find((account) => account.id === command.actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Управление учётными записями доступно только активному настройщику.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) throw new Error("Данные изменились в другой вкладке. Обновите список и повторите действие.");
  return actor;
};

export const createAccount = (state: AccountsDocument, command: AccountCommandContext & { draft: AccountDraft; expectedStudentNumber?: string }, id: string, changeId: string, occurredAt: string): AccountsDocument => {
  authorizeAccountCommand(state, command);
  if (!id || state.accounts.some((account) => account.id === id)) throw new Error("Не удалось создать уникальную учётную запись.");
  const draft = validateAccountDraft(command.draft, state.accounts);
  const allocation = draft.role === "student" ? allocateStudentNumber(state, command.draft.studentCampus, command.expectedStudentNumber, occurredAt) : undefined;
  return { ...state, ...(allocation ? { studentNumberCounters: allocation.studentNumberCounters } : {}), revision: state.revision + 1, accounts: [...state.accounts, { ...draft, id, revision: 1, status: "active", createdAt: occurredAt, updatedAt: occurredAt, ...(allocation ? { studentRecord: allocation.studentRecord } : {}) }], history: [...state.history, { id: changeId, accountId: id, actorId: command.actorId, occurredAt, action: "created", previousRole: null, nextRole: draft.role }] };
};

export const changeAccountRole = (state: AccountsDocument, command: AccountCommandContext & { accountId: string; accountRevision: number; role: UserRole; memberships: AcademicMembership[]; studentGroupId?: string; studentCampus?: number; expectedStudentNumber?: string }, changeId: string, occurredAt: string): AccountsDocument => {
  authorizeAccountCommand(state, command);
  const current = state.accounts.find((account) => account.id === command.accountId);
  if (!current || current.revision !== command.accountRevision) throw new Error("Учётная запись изменилась. Обновите список и повторите действие.");
  const restriction = getAccountRoleRestriction(current, command.role, state.accounts);
  if (restriction) throw new Error(restriction);
  const draft = validateAccountDraft({ ...current, role: command.role, memberships: command.memberships, studentGroupId: command.studentGroupId }, state.accounts, current.id);
  if (current.role === command.role) throw new Error("Этот тип учётной записи уже установлен.");
  const lastEducation = state.educationEvents?.filter((event) => event.accountId === current.id).at(-1);
  if (command.role === "student" && lastEducation && (getStudentGroupId(draft) !== lastEducation.after.groupId || (draft.enrollmentStatus ?? "studying") !== lastEducation.after.enrollment)) throw new Error("При возвращении типа «Студент» выберите последнюю группу из истории обучения. Дальнейший перевод оформляется отдельным событием.");
  const allocation = command.role === "student" && !current.studentRecord ? allocateStudentNumber(state, command.studentCampus, command.expectedStudentNumber, occurredAt) : undefined;
  return { ...state, ...(allocation ? { studentNumberCounters: allocation.studentNumberCounters } : {}), revision: state.revision + 1, accounts: state.accounts.map((account) => account.id === current.id ? { ...account, ...draft, ...(allocation ? { studentRecord: allocation.studentRecord } : {}), updatedAt: occurredAt, revision: account.revision + 1 } : account), history: [...state.history, { id: changeId, actorId: command.actorId, accountId: current.id, occurredAt, action: "role-changed", previousRole: current.role, nextRole: command.role }] };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isMembershipList = (value: unknown): value is AcademicMembership[] => Array.isArray(value) && value.every((entry) => isRecord(entry) && typeof entry.subjectId === "string" && Array.isArray(entry.groupIds) && entry.groupIds.every((id) => typeof id === "string"));

export type UpdateAssignmentsCommand = AccountCommandContext & { accountId: string; accountRevision: number; memberships: AcademicMembership[] };
export const replaceSubjectTeachingGroups = (memberships: AcademicMembership[], subjectId: string, groupIds: string[]): AcademicMembership[] => [
  ...memberships.filter((entry) => entry.subjectId !== subjectId).map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })),
  ...(groupIds.length ? [{ subjectId, groupIds: [...groupIds] }] : []),
];

export const updateTeacherAssignments = (state: AccountsDocument, command: UpdateAssignmentsCommand, changeId: string, occurredAt: string): AccountsDocument => {
  authorizeAccountCommand(state, command);
  const current = state.accounts.find((account) => account.id === command.accountId);
  if (!current || current.revision !== command.accountRevision) throw new Error("Учётная запись изменилась. Обновите назначения и повторите действие.");
  if (current.role !== "teacher") throw new Error("Учебные назначения доступны только преподавателю.");
  const draft = validateAccountDraft({ ...current, memberships: command.memberships }, state.accounts, current.id);
  const canonical = (memberships: AcademicMembership[]) => JSON.stringify(memberships.map((entry) => ({ subjectId: entry.subjectId, groupIds: [...entry.groupIds].sort() })).sort((a, b) => a.subjectId.localeCompare(b.subjectId)));
  if (canonical(current.memberships) === canonical(draft.memberships)) throw new Error("Назначения не изменились.");
  const copy = (memberships: AcademicMembership[]) => memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] }));
  return { ...state, revision: state.revision + 1, accounts: state.accounts.map((account) => account.id === current.id ? { ...account, memberships: draft.memberships, revision: account.revision + 1 } : account), history: [...state.history, { id: changeId, actorId: command.actorId, accountId: current.id, occurredAt, action: "assignments-changed", previousRole: current.role, nextRole: current.role, previousMemberships: copy(current.memberships), nextMemberships: copy(draft.memberships) }] };
};

export type AccountTargetCommand = AccountCommandContext & { accountId: string; accountRevision: number };
const getCommandAccount = (state: AccountsDocument, command: AccountTargetCommand) => {
  authorizeAccountCommand(state, command);
  const account = state.accounts.find((entry) => entry.id === command.accountId);
  if (!account || account.revision !== command.accountRevision) throw new Error("Учётная запись изменилась. Откройте её заново и повторите действие.");
  return account;
};
const updateAccount = (state: AccountsDocument, account: PortalAccount, patch: Partial<PortalAccount>, change: AccountChange): AccountsDocument => ({
  ...state, revision: state.revision + 1,
  accounts: state.accounts.map((entry) => entry.id === account.id ? { ...entry, ...patch, updatedAt: change.occurredAt, revision: entry.revision + 1 } : entry),
  history: [...state.history, change],
});
export type UpdateAccountDetailsCommand = AccountTargetCommand & { details: { name: string; login: string; email?: string; memberships?: AcademicMembership[]; studentGroupId?: string; enrollmentStatus?: StudentEnrollmentStatus }; education?: EducationEventDetails };
export const updateAccountDetails = (state: AccountsDocument, command: UpdateAccountDetailsCommand, changeId: string, occurredAt: string): AccountsDocument => {
  const current = getCommandAccount(state, command);
  if (current.role !== "student" && (command.details.memberships || command.details.studentGroupId !== undefined || command.details.enrollmentStatus !== undefined)) throw new Error("Учебная группа и состояние обучения доступны только студенту. Назначения преподавателя меняются в разделе «Дисциплины».");
  const studentGroupId = command.details.studentGroupId ?? (command.details.memberships ? getStudentGroupId({ role: current.role, memberships: command.details.memberships }) : current.studentGroupId);
  const draft = validateAccountDraft({ ...current, name: command.details.name, login: command.details.login, email: command.details.email, memberships: command.details.memberships ?? current.memberships, studentGroupId, enrollmentStatus: command.details.enrollmentStatus ?? current.enrollmentStatus }, state.accounts, current.id);
  const changes: AccountFieldChange[] = [];
  if ((current.enrollmentStatus ?? "studying") !== (draft.enrollmentStatus ?? "studying")) changes.push({ field: "enrollmentStatus", before: current.enrollmentStatus ?? "studying", after: draft.enrollmentStatus ?? "studying" });
  for (const field of ["name", "login", "email"] as const) if ((current[field] ?? "") !== (draft[field] ?? "")) changes.push({ field, before: current[field] ?? "", after: draft[field] ?? "" });
  const groups = (entries: AcademicMembership[]) => [...new Set(entries.flatMap((entry) => entry.groupIds))].sort().join(", ");
  if (JSON.stringify(current.memberships) !== JSON.stringify(draft.memberships) || getStudentGroupId(current) !== getStudentGroupId(draft)) changes.push({ field: "group", before: getStudentGroupId(current) ?? groups(current.memberships), after: getStudentGroupId(draft) ?? groups(draft.memberships) });
  if (!changes.length) throw new Error("Данные учётной записи не изменились.");
  if (current.role === "student" && changes.some((change) => change.field === "group" || change.field === "enrollmentStatus") && !command.education && state.educationEvents?.some((event) => event.accountId === current.id)) throw new Error("Для изменения обучения укажите дату действия и основание.");
  return updateAccount(state, current, { ...draft, ...(changes.some((entry) => entry.field === "name") ? { scheduleName: undefined } : {}) }, { id: changeId, actorId: command.actorId, accountId: current.id, occurredAt, action: "details-changed", previousRole: current.role, nextRole: current.role, changes });
};
export const changeAccountStatus = (state: AccountsDocument, command: AccountTargetCommand & { status: "active" | "blocked" }, changeId: string, occurredAt: string): AccountsDocument => {
  const current = getCommandAccount(state, command);
  if (command.status !== "active" && command.status !== "blocked") throw new Error("Выберите допустимый статус учётной записи.");
  if ((current.status ?? "active") === command.status) throw new Error("Этот статус уже установлен.");
  const restriction = command.status === "blocked" ? getAccountBlockRestriction(current, command.actorId, state.accounts) : "";
  if (restriction) throw new Error(restriction);
  return updateAccount(state, current, { status: command.status }, { id: changeId, actorId: command.actorId, accountId: current.id, occurredAt, action: "status-changed", previousRole: current.role, nextRole: current.role, changes: [{ field: "status", before: current.status ?? "active", after: command.status }] });
};
export const issueStudentRecord = (state: AccountsDocument, command: AccountTargetCommand & { campus: number; expectedStudentNumber: string }, changeId: string, occurredAt: string): AccountsDocument => {
  const current = getCommandAccount(state, command);
  if (current.role !== "student") throw new Error("Номер зачетки выдаётся только студенту.");
  if (current.studentRecord) throw new Error("Номер зачетки уже выдан и не может быть изменён.");
  const allocation = allocateStudentNumber(state, command.campus, command.expectedStudentNumber, occurredAt);
  return { ...updateAccount(state, current, { studentRecord: allocation.studentRecord }, { id: changeId, actorId: command.actorId, accountId: current.id, occurredAt, action: "student-number-issued", previousRole: current.role, nextRole: current.role, changes: [{ field: "studentNumber", before: "", after: allocation.studentRecord.number }] }), studentNumberCounters: allocation.studentNumberCounters };
};

export const decodeAccountsDocument = (raw: string): AccountsDocument => {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.accounts) || !value.accounts.length || !Array.isArray(value.history)) throw new Error("Неверный формат хранилища учётных записей.");
  const accounts: PortalAccount[] = [];
  const ids = new Set<string>();
  const logins = new Set<string>();
  const studentNumbers = new Set<string>();
  for (const item of value.accounts) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || typeof item.login !== "string" || !isUserRole(item.role) || !Number.isSafeInteger(item.revision) || (item.revision as number) < 1 || !Array.isArray(item.memberships) || (item.scheduleName !== undefined && typeof item.scheduleName !== "string")) throw new Error("Повреждена учётная запись.");
    for (const entry of item.memberships) if (!isRecord(entry) || typeof entry.subjectId !== "string" || !Array.isArray(entry.groupIds) || entry.groupIds.some((id) => typeof id !== "string")) throw new Error("Повреждены учебные назначения.");
    const account = item as PortalAccount;
    if ((account.status !== undefined && !["active", "blocked"].includes(account.status)) || (account.studentRecord !== undefined && !isStudentRecord(account.studentRecord)) || (account.email !== undefined && typeof account.email !== "string") || [account.createdAt, account.updatedAt].some((date) => date !== undefined && (typeof date !== "string" || !Number.isFinite(Date.parse(date))))) throw new Error("Повреждены данные учётной записи.");
    if (ids.has(account.id)) throw new Error("Повторяется ID учётной записи.");
    if (logins.has(normalizeAccountLogin(account.login))) throw new Error("Этот логин уже занят.");
    if (account.studentRecord && studentNumbers.has(account.studentRecord.number)) throw new Error("Повторяется номер зачетки.");
    validateAccountDraft(account, []);
    ids.add(account.id); logins.add(normalizeAccountLogin(account.login));
    if (account.studentRecord) studentNumbers.add(account.studentRecord.number);
    accounts.push(account);
  }
  if (!accounts.some((account) => account.role === "configurator" && isAccountActive(account))) throw new Error("В хранилище отсутствует активный настройщик.");
  if (value.studentNumberCounters !== undefined && (!isRecord(value.studentNumberCounters) || Object.entries(value.studentNumberCounters).some(([key, count]) => !/^[2-9][0-9]{3}:[1-9]$/.test(key) || !Number.isInteger(count) || Number(count) < 0 || Number(count) > 9999))) throw new Error("Повреждены счётчики номеров зачеток.");
  for (const change of value.history) if (!isRecord(change) || typeof change.id !== "string" || typeof change.actorId !== "string" || typeof change.accountId !== "string" || typeof change.occurredAt !== "string" || !Number.isFinite(Date.parse(change.occurredAt)) || !["created", "role-changed", "assignments-changed", "details-changed", "status-changed", "student-number-issued"].includes(String(change.action)) || !isUserRole(change.nextRole) || (change.previousRole !== null && !isUserRole(change.previousRole)) || (change.previousMemberships !== undefined && !isMembershipList(change.previousMemberships)) || (change.nextMemberships !== undefined && !isMembershipList(change.nextMemberships)) || (change.changes !== undefined && (!Array.isArray(change.changes) || change.changes.some((entry) => !isRecord(entry) || typeof entry.field !== "string" || typeof entry.before !== "string" || typeof entry.after !== "string"))) || (change.action === "assignments-changed" && (!isMembershipList(change.previousMemberships) || !isMembershipList(change.nextMemberships)))) throw new Error("Повреждена история учётных записей.");
  if (value.studentImports !== undefined) {
    if (!Array.isArray(value.studentImports) || !value.studentImports.every(isStudentImportReceipt)) throw new Error("Повреждена история импорта студентов.");
    const receipts = value.studentImports as StudentImportReceipt[];
    if (new Set(receipts.map((receipt) => receipt.id)).size !== receipts.length || new Set(receipts.map((receipt) => receipt.fingerprint)).size !== receipts.length) throw new Error("Повторяется пакет импорта студентов.");
    const byId = new Map(accounts.map((account) => [account.id, account]));
    for (const receipt of receipts) if (receipt.created.some((row) => byId.get(row.accountId)?.studentRecord?.number !== row.studentNumber) || receipt.skipped.some((row) => !byId.has(row.accountId))) throw new Error("Пакет импорта ссылается на отсутствующую учётку или другой номер зачетки.");
  }
  const importedAccountIds = new Map(((value.studentImports ?? []) as StudentImportReceipt[]).map((receipt) => [receipt.id, new Set(receipt.created.map((row) => row.accountId))]));
  for (const change of value.history) if (change.importBatchId !== undefined && (typeof change.importBatchId !== "string" || !importedAccountIds.get(change.importBatchId)?.has(change.accountId))) throw new Error("Повреждена связь истории с пакетом импорта.");
  if (value.studentOperations !== undefined) {
    if (!Array.isArray(value.studentOperations) || !value.studentOperations.every(isStudentBulkReceipt)) throw new Error("Повреждена история пакетных изменений студентов.");
    const operations = value.studentOperations as StudentBulkReceipt[];
    if (new Set(operations.map((operation) => operation.id)).size !== operations.length || operations.some((operation) => operation.rows.some((row) => !ids.has(row.accountId)))) throw new Error("Повторяется пакет изменений или отсутствует связанная учётка.");
  }
  const operationAccounts = new Map(((value.studentOperations ?? []) as StudentBulkReceipt[]).map((operation) => [operation.id, new Set(operation.rows.filter((row) => row.outcome === "changed").map((row) => row.accountId))]));
  for (const change of value.history) if (change.studentOperationBatchId !== undefined && (typeof change.studentOperationBatchId !== "string" || !operationAccounts.get(change.studentOperationBatchId)?.has(change.accountId))) throw new Error("Повреждена связь аудита с пакетным изменением студентов.");
  if (value.educationEvents !== undefined && (!Array.isArray(value.educationEvents) || !value.educationEvents.every(isStudentEducationEvent))) throw new Error("Повреждена история обучения студентов.");
  const educationEvents = (value.educationEvents ?? []) as StudentEducationEvent[];
  const eventsById = new Map<string, StudentEducationEvent>(); const lastByAccount = new Map<string, StudentEducationEvent>();
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const operationRows = new Map(((value.studentOperations ?? []) as StudentBulkReceipt[]).map((operation) => [operation.id, new Map(operation.rows.map((row) => [row.accountId, row]))]));
  const operationById = new Map(((value.studentOperations ?? []) as StudentBulkReceipt[]).map((operation) => [operation.id, operation]));
  const auditById = new Map((value.history as AccountChange[]).map((entry) => [entry.id, entry]));
  for (const event of educationEvents) {
    const previous = lastByAccount.get(event.accountId); const audit = auditById.get(event.auditId);
    if (eventsById.has(event.id) || !ids.has(event.accountId) || event.accountRevisionAfter > accountById.get(event.accountId)!.revision || !audit || audit.accountId !== event.accountId || audit.actorId !== event.actorId || audit.educationEventId !== event.id || audit.occurredAt !== event.registeredAt || audit.studentOperationBatchId !== event.batchId || (event.batchId && !operationAccounts.get(event.batchId)?.has(event.accountId)) || (previous && (event.kind === "admitted" || event.effectiveDate < previous.effectiveDate || event.accountRevisionAfter <= previous.accountRevisionAfter || !event.before || !sameEducationState(previous.after, event.before)))) throw new Error("Нарушены связи или хронология событий обучения.");
    if (event.batchId) { const operation = operationById.get(event.batchId)!; const row = operationRows.get(event.batchId)?.get(event.accountId); if (!operation.education || operation.education.effectiveDate !== event.effectiveDate || operation.education.basis !== event.basis || operation.education.documentNumber !== event.documentNumber || operation.education.documentDate !== event.documentDate || !row || !event.before || !sameEducationState(row.before, event.before) || !sameEducationState(row.after, event.after)) throw new Error("Событие обучения расходится с массовым действием."); }
    eventsById.set(event.id, event); lastByAccount.set(event.accountId, event);
  }
  const eventAccountsByBatch = new Map<string, Set<string>>();
  for (const event of educationEvents) if (event.batchId) { const accountIds = eventAccountsByBatch.get(event.batchId) ?? new Set<string>(); accountIds.add(event.accountId); eventAccountsByBatch.set(event.batchId, accountIds); }
  for (const operation of (value.studentOperations ?? []) as StudentBulkReceipt[]) if (operation.education && operation.rows.some((row) => row.outcome === "changed" && !eventAccountsByBatch.get(operation.id)?.has(row.accountId))) throw new Error("В массовом действии отсутствуют связанные события обучения.");
  for (const audit of value.history as AccountChange[]) if (audit.educationEventId !== undefined && eventsById.get(audit.educationEventId)?.auditId !== audit.id) throw new Error("Событие обучения в аудите недоступно.");
  return value as AccountsDocument;
};
