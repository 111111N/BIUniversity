import { authorizeAccountCommand, getStudentGroupId, type AccountsDocument, type AccountTargetCommand, type PortalAccount } from "./accounts";
import { educationContinuationError, normalizeEducationDetails, sameEducationState, type EducationEventDetails, type EducationState, type StudentEducationEvent } from "./studentEducationEvent";
import type { RegistryGroup } from "./studentRegistry";

export const educationStateFor = (account: PortalAccount, groups: RegistryGroup[]): EducationState => {
  const groupId = getStudentGroupId(account); const group = groups.find((entry) => entry.id === groupId);
  if (!groupId || !group) throw new Error("Учебная группа недоступна. Проверьте учётную запись студента.");
  return { groupId, groupName: group.name, enrollment: account.enrollmentStatus ?? "studying" };
};
export const appendEducationChange = (state: AccountsDocument, accountId: string, before: EducationState, after: EducationState, details: EducationEventDetails | undefined, auditId: string, registeredAt: string, batchId?: string): AccountsDocument => {
  if (sameEducationState(before, after)) return state;
  const events = state.educationEvents ?? []; const own = events.filter((event) => event.accountId === accountId);
  if (!details) { if (own.length) throw new Error("Для изменения группы или состояния укажите дату действия и основание события обучения."); return state; }
  const normalized = normalizeEducationDetails(details, registeredAt);
  const continuation = educationContinuationError(own, before, normalized.effectiveDate);
  if (continuation) throw new Error(continuation);
  if (before.groupId !== after.groupId && before.enrollment !== after.enrollment) throw new Error("Перевод и изменение состояния обучения оформляются отдельными событиями.");
  if (before.groupId !== after.groupId && (before.enrollment !== "studying" || after.enrollment !== "studying")) throw new Error("Для перевода сначала отдельно возобновите обучение студента.");
  const account = state.accounts.find((entry) => entry.id === accountId);
  if (!account || !state.history.some((entry) => entry.id === auditId && entry.accountId === accountId)) throw new Error("Не удалось связать событие с учёткой и аудитом.");
  const kind = before.groupId !== after.groupId ? "transferred" : after.enrollment === "studying" ? "reinstated" : after.enrollment;
  const event: StudentEducationEvent = { ...normalized, id: `education-${auditId}`, accountId, actorId: state.history.find((entry) => entry.id === auditId)!.actorId, registeredAt, accountRevisionAfter: account.revision, kind, before, after, auditId, ...(batchId ? { batchId } : {}) };
  if (events.some((entry) => entry.id === event.id)) throw new Error("Событие обучения уже зарегистрировано.");
  return { ...state, educationEvents: [...events, event], history: state.history.map((entry) => entry.id === auditId ? { ...entry, educationEventId: event.id } : entry) };
};
export interface ConfirmAdmissionCommand extends AccountTargetCommand { expectedGroupRevision: number; education: EducationEventDetails }
export const getAdmissionRestriction = (account: PortalAccount, events: StudentEducationEvent[], groups: RegistryGroup[]) => {
  if (account.role !== "student") return "Учётная запись студента изменилась. Откройте сведения заново.";
  if (events.some((event) => event.accountId === account.id)) return "История обучения уже начата. Ранние даты автоматически не вставляются между событиями.";
  const groupId = getStudentGroupId(account);
  const group = groups.find((entry) => entry.id === groupId);
  if (!groupId || !group) return "Учебная группа недоступна. Проверьте учётную запись студента.";
  if ((account.enrollmentStatus ?? "studying") !== "studying") return "Подтвердить зачисление можно учащемуся. Для завершённого обучения сначала уточните исходные сведения.";
  if (group.status === "archived") return "Группа в архиве. Подтверждение зачисления требует действующей группы.";
  return "";
};
export const confirmStudentAdmission = (state: AccountsDocument, command: ConfirmAdmissionCommand, groups: RegistryGroup[], groupRevision: number, auditId: string, registeredAt: string): AccountsDocument => {
  authorizeAccountCommand(state, command);
  if (groupRevision !== command.expectedGroupRevision) throw new Error("Справочник групп изменился. Обновите сведения перед подтверждением зачисления.");
  const account = state.accounts.find((entry) => entry.id === command.accountId);
  if (!account || account.role !== "student" || account.revision !== command.accountRevision) throw new Error("Учётная запись студента изменилась. Откройте сведения заново.");
  const restriction = getAdmissionRestriction(account, state.educationEvents ?? [], groups);
  if (restriction) throw new Error(restriction);
  const after = educationStateFor(account, groups);
  const education = normalizeEducationDetails(command.education, registeredAt);
  if (!auditId || state.history.some((entry) => entry.id === auditId)) throw new Error("Не удалось подготовить аудит зачисления.");
  const event: StudentEducationEvent = { ...education, id: `education-${auditId}`, accountId: account.id, actorId: command.actorId, registeredAt, accountRevisionAfter: account.revision + 1, kind: "admitted", after, auditId };
  return { ...state, revision: state.revision + 1, accounts: state.accounts.map((entry) => entry.id === account.id ? { ...entry, revision: entry.revision + 1, updatedAt: registeredAt } : entry), educationEvents: [...(state.educationEvents ?? []), event], history: [...state.history, { id: auditId, actorId: command.actorId, accountId: account.id, occurredAt: registeredAt, action: "details-changed", previousRole: "student", nextRole: "student", educationEventId: event.id, changes: [{ field: "admissionDate", before: "", after: education.effectiveDate }] }] };
};
