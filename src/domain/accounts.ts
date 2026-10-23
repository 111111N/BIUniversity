export type UserRole = "teacher" | "student" | "configurator";
export type AcademicMembership = { subjectId: string; groupIds: string[] };
export type CurrentUser = { id: string; name: string; role: UserRole; scheduleName?: string; memberships: AcademicMembership[] };
export type PortalAccount = CurrentUser & { login: string; revision: number };
export type AccountDraft = { name: string; login: string; role: UserRole; memberships: AcademicMembership[]; scheduleName?: string };
export type AccountChange = { id: string; actorId: string; accountId: string; occurredAt: string; action: "created" | "role-changed" | "assignments-changed"; previousRole: UserRole | null; nextRole: UserRole; previousMemberships?: AcademicMembership[]; nextMemberships?: AcademicMembership[] };
export type AccountsDocument = { version: 1; revision: number; accounts: PortalAccount[]; history: AccountChange[] };
export type AccountCommandContext = { actorId: string; actorRevision: number; expectedRevision: number };

export const ACCOUNT_ROLE_LABELS: Record<UserRole, string> = { teacher: "Преподаватель", student: "Студент", configurator: "Настройщик" };
export const isUserRole = (value: unknown): value is UserRole => value === "teacher" || value === "student" || value === "configurator";
export const normalizeAccountLogin = (login: string) => login.normalize("NFKC").trim().toLowerCase();

export const validateAccountDraft = (draft: AccountDraft, accounts: PortalAccount[], excludedId?: string) => {
  const name = draft.name.trim().replace(/\s+/g, " ");
  const login = normalizeAccountLogin(draft.login);
  if (name.length < 2 || name.length > 120) throw new Error("Укажите имя длиной от 2 до 120 символов.");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login)) throw new Error("Логин: 3–64 латинских символа, цифры, точка, дефис или подчёркивание.");
  if (accounts.some((account) => account.id !== excludedId && normalizeAccountLogin(account.login) === login)) throw new Error("Этот логин уже занят.");
  if (!isUserRole(draft.role)) throw new Error("Выберите корректный тип учётной записи.");
  if (!Array.isArray(draft.memberships) || draft.memberships.some((entry) => !entry.subjectId || !Array.isArray(entry.groupIds) || !entry.groupIds.length || entry.groupIds.some((id) => !id))) throw new Error("Проверьте учебные назначения.");
  if (draft.role === "student" && !draft.memberships.length) throw new Error("Выберите учебную группу студента.");
  if (draft.role === "student" && new Set(draft.memberships.flatMap((entry) => entry.groupIds)).size !== 1) throw new Error("Студент должен состоять в одной учебной группе.");
  if (draft.role === "configurator" && draft.memberships.length) throw new Error("Настройщику не требуются учебные назначения.");
  if (new Set(draft.memberships.map((entry) => entry.subjectId)).size !== draft.memberships.length || draft.memberships.some((entry) => new Set(entry.groupIds).size !== entry.groupIds.length)) throw new Error("Учебные назначения не должны повторяться.");
  return { ...draft, name, login, memberships: draft.memberships.map((entry) => ({ subjectId: entry.subjectId, groupIds: [...entry.groupIds] })), scheduleName: draft.scheduleName?.trim() || undefined };
};

export const authorizeAccountCommand = (state: AccountsDocument, command: AccountCommandContext) => {
  const actor = state.accounts.find((account) => account.id === command.actorId);
  if (!actor || actor.role !== "configurator") throw new Error("Управление учётными записями доступно только настройщику.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) throw new Error("Данные изменились в другой вкладке. Обновите список и повторите действие.");
  return actor;
};

export const createAccount = (state: AccountsDocument, command: AccountCommandContext & { draft: AccountDraft }, id: string, changeId: string, occurredAt: string): AccountsDocument => {
  authorizeAccountCommand(state, command);
  if (!id || state.accounts.some((account) => account.id === id)) throw new Error("Не удалось создать уникальную учётную запись.");
  const draft = validateAccountDraft(command.draft, state.accounts);
  return { ...state, revision: state.revision + 1, accounts: [...state.accounts, { ...draft, id, revision: 1 }], history: [...state.history, { id: changeId, accountId: id, actorId: command.actorId, occurredAt, action: "created", previousRole: null, nextRole: draft.role }] };
};

export const changeAccountRole = (state: AccountsDocument, command: AccountCommandContext & { accountId: string; accountRevision: number; role: UserRole; memberships: AcademicMembership[] }, changeId: string, occurredAt: string): AccountsDocument => {
  authorizeAccountCommand(state, command);
  const current = state.accounts.find((account) => account.id === command.accountId);
  if (!current || current.revision !== command.accountRevision) throw new Error("Учётная запись изменилась. Обновите список и повторите действие.");
  if (current.role === "configurator" && command.role !== "configurator" && state.accounts.filter((account) => account.role === "configurator").length <= 1) throw new Error("Нельзя изменить тип последнего настройщика. Сначала создайте другого настройщика.");
  const draft = validateAccountDraft({ ...current, role: command.role, memberships: command.memberships }, state.accounts, current.id);
  if (current.role === command.role) throw new Error("Этот тип учётной записи уже установлен.");
  return { ...state, revision: state.revision + 1, accounts: state.accounts.map((account) => account.id === current.id ? { ...account, ...draft, revision: account.revision + 1 } : account), history: [...state.history, { id: changeId, actorId: command.actorId, accountId: current.id, occurredAt, action: "role-changed", previousRole: current.role, nextRole: command.role }] };
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

export const decodeAccountsDocument = (raw: string): AccountsDocument => {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.accounts) || !value.accounts.length || !Array.isArray(value.history)) throw new Error("Неверный формат хранилища учётных записей.");
  const accounts: PortalAccount[] = [];
  for (const item of value.accounts) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || typeof item.login !== "string" || !isUserRole(item.role) || !Number.isSafeInteger(item.revision) || (item.revision as number) < 1 || !Array.isArray(item.memberships) || (item.scheduleName !== undefined && typeof item.scheduleName !== "string")) throw new Error("Повреждена учётная запись.");
    for (const entry of item.memberships) if (!isRecord(entry) || typeof entry.subjectId !== "string" || !Array.isArray(entry.groupIds) || entry.groupIds.some((id) => typeof id !== "string")) throw new Error("Повреждены учебные назначения.");
    const account = item as PortalAccount;
    if (accounts.some((existing) => existing.id === account.id)) throw new Error("Повторяется ID учётной записи.");
    validateAccountDraft(account, accounts);
    accounts.push(account);
  }
  if (!accounts.some((account) => account.role === "configurator")) throw new Error("В хранилище отсутствует настройщик.");
  for (const change of value.history) if (!isRecord(change) || typeof change.id !== "string" || typeof change.actorId !== "string" || typeof change.accountId !== "string" || typeof change.occurredAt !== "string" || !Number.isFinite(Date.parse(change.occurredAt)) || !["created", "role-changed", "assignments-changed"].includes(String(change.action)) || !isUserRole(change.nextRole) || (change.previousRole !== null && !isUserRole(change.previousRole)) || (change.previousMemberships !== undefined && !isMembershipList(change.previousMemberships)) || (change.nextMemberships !== undefined && !isMembershipList(change.nextMemberships)) || (change.action === "assignments-changed" && (!isMembershipList(change.previousMemberships) || !isMembershipList(change.nextMemberships)))) throw new Error("Повреждена история учётных записей.");
  return value as AccountsDocument;
};
