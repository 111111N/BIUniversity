import { getStudentGroupId, isAccountActive, type PortalAccount } from "../../domain/accounts";
import { getAdmissionRestriction } from "../../domain/studentEducation";
import { getEducationDetailsErrors, type EducationEventDetails, type StudentEducationEvent } from "../../domain/studentEducationEvent";
import type { RegistryGroup } from "../../domain/studentRegistry";

export interface AdmissionEditor {
  account: PortalAccount; groupName: string; education: EducationEventDetails; baseline: EducationEventDetails;
  actorId: string; actorRevision: number; revision: number; groupRevision: number;
}
export interface AdmissionRefreshSource {
  accounts: PortalAccount[]; educationEvents: StudentEducationEvent[]; revision: number; actorId: string; error?: string;
  groups: RegistryGroup[]; groupRevision: number; groupError?: string;
}
export interface AdmissionRefreshReview {
  accountId: string; latest: PortalAccount | null; currentGroup: string; firstEvent: Pick<StudentEducationEvent, "kind" | "effectiveDate"> | null;
  actorId: string; actorRevision: number; revision: number; groupRevision: number;
  baseKey: string; restriction: string; fieldProblem: string;
}
const copyAccount = (account: PortalAccount): PortalAccount => ({ ...account, memberships: account.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })), ...(account.studentRecord ? { studentRecord: { ...account.studentRecord } } : {}) });
const baseKey = (editor: AdmissionEditor) => JSON.stringify([editor.account, editor.groupName, editor.education, editor.baseline, editor.actorId, editor.actorRevision, editor.revision, editor.groupRevision]);
const groupName = (account: PortalAccount | undefined, source: AdmissionRefreshSource) => source.groups.find((group) => group.id === (account && getStudentGroupId(account)))?.name ?? "Группа недоступна";
const actorFor = (actorId: string, source: AdmissionRefreshSource) => {
  if (source.error || source.groupError) throw new Error(source.error || source.groupError);
  const actor = source.accounts.find((entry) => entry.id === source.actorId);
  if (actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Пользователь или права изменились. Введённые реквизиты оставлены в форме.");
  return actor;
};
export function makeAdmissionEditor(accountId: string, education: EducationEventDetails, source: AdmissionRefreshSource): AdmissionEditor {
  const actor = actorFor(source.actorId, source);
  const account = source.accounts.find((entry) => entry.id === accountId);
  if (!account) throw new Error("Учётная запись студента недоступна.");
  const restriction = getAdmissionRestriction(account, source.educationEvents, source.groups);
  if (restriction) throw new Error(restriction);
  return { account: copyAccount(account), groupName: groupName(account, source), education: { ...education }, baseline: { ...education }, actorId: actor.id, actorRevision: actor.revision, revision: source.revision, groupRevision: source.groupRevision };
}
export const isAdmissionReviewStale = (review: AdmissionRefreshReview, source: AdmissionRefreshSource) => {
  const actor = source.accounts.find((entry) => entry.id === source.actorId);
  return Boolean(source.error || source.groupError) || review.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)
    || actor.revision !== review.actorRevision || source.revision !== review.revision || source.groupRevision !== review.groupRevision
    || source.accounts.find((entry) => entry.id === review.accountId)?.revision !== review.latest?.revision;
};
export function prepareAdmissionRefresh(editor: AdmissionEditor, source: AdmissionRefreshSource, now: string): AdmissionRefreshReview {
  const actor = actorFor(editor.actorId, source);
  const latest = source.accounts.find((entry) => entry.id === editor.account.id);
  const first = source.educationEvents.find((entry) => entry.accountId === editor.account.id);
  return {
    accountId: editor.account.id, latest: latest ? copyAccount(latest) : null, currentGroup: groupName(latest, source),
    firstEvent: first ? { kind: first.kind, effectiveDate: first.effectiveDate } : null,
    actorId: actor.id, actorRevision: actor.revision, revision: source.revision, groupRevision: source.groupRevision, baseKey: baseKey(editor),
    restriction: latest ? getAdmissionRestriction(latest, source.educationEvents, source.groups) : "Учётная запись студента недоступна. Введённые реквизиты оставлены в форме.",
    fieldProblem: getEducationDetailsErrors(editor.education, now)[0]?.message ?? "",
  };
}
export function applyAdmissionRefresh(editor: AdmissionEditor, review: AdmissionRefreshReview, source: AdmissionRefreshSource): AdmissionEditor {
  const actor = actorFor(editor.actorId, source);
  if (editor.account.id !== review.accountId || baseKey(editor) !== review.baseKey || isAdmissionReviewStale(review, source)) throw new Error("Сведения или сравнение снова изменились. Обновите сравнение; введённые реквизиты сохранены.");
  const account = source.accounts.find((entry) => entry.id === review.accountId);
  if (!account) throw new Error("Учётная запись студента недоступна. Введённые реквизиты оставлены в форме.");
  const restriction = getAdmissionRestriction(account, source.educationEvents, source.groups);
  if (restriction) throw new Error(restriction);
  return { ...editor, account: copyAccount(account), groupName: groupName(account, source), actorRevision: actor.revision, revision: source.revision, groupRevision: source.groupRevision, education: { ...editor.education }, baseline: { ...editor.baseline } };
}
