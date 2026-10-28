import { getStudentGroupId, isAccountActive, type AccountDraft, type PortalAccount } from "../../domain/accounts";
import type { EducationEventDetails, StudentEducationEvent } from "../../domain/studentEducationEvent";
import type { RegistryGroup } from "../../domain/studentRegistry";
import { accountDetailsDraftFrom } from "./accountDetailsRefresh";
import { getEducationOperationProblem, prepareEducationOperation, type EducationOperation } from "./educationOperationModel";

export interface EducationRefreshEditor {
  account: PortalAccount; draft: AccountDraft; baseline: string; educationOperation: EducationOperation;
  education: EducationEventDetails; educationBaseline: EducationEventDetails;
  actorId: string; actorRevision: number; revision: number; educationGroupRevision: number;
}
export interface EducationRefreshSource {
  accounts: PortalAccount[]; educationEvents: StudentEducationEvent[]; revision: number; actorId: string; error?: string;
  groups: RegistryGroup[]; groupRevision: number; groupError?: string;
}
export interface EducationRefreshReview {
  operation: EducationOperation;
  latest: PortalAccount; revision: number; groupRevision: number; actorId: string; actorRevision: number;
  baseRevision: number; baseAccountRevision: number; baseGroupRevision: number;
  beforeGroup: string; currentGroup: string; targetGroup: string; problem: string; lastEventDate?: string;
}
const actorFor = (editor: EducationRefreshEditor, source: EducationRefreshSource) => {
  if (source.error || source.groupError) throw new Error(source.error || source.groupError);
  const actor = source.accounts.find((account) => account.id === source.actorId);
  if (editor.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Пользователь или права изменились. Ввод учебной операции оставлен в форме.");
  return actor;
};
const selectedTransferTarget = (editor: EducationRefreshEditor) => {
  const selected = getStudentGroupId(editor.draft);
  return selected !== getStudentGroupId(editor.account) ? selected : undefined;
};
const refreshed = (editor: EducationRefreshEditor, latest: PortalAccount, source: EducationRefreshSource): EducationRefreshEditor => {
  const base = accountDetailsDraftFrom(latest);
  const draft = prepareEducationOperation(latest, base, editor.educationOperation);
  if (editor.educationOperation === "transfer") { draft.studentGroupId = selectedTransferTarget(editor) ?? getStudentGroupId(latest); draft.memberships = []; }
  return { ...editor, account: { ...latest, memberships: latest.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })), ...(latest.studentRecord ? { studentRecord: { ...latest.studentRecord } } : {}) }, draft, baseline: JSON.stringify(base), education: { ...editor.education }, educationBaseline: { ...editor.educationBaseline }, revision: source.revision, educationGroupRevision: source.groupRevision, actorRevision: source.accounts.find((account) => account.id === source.actorId)!.revision };
};
export const isEducationRefreshStale = (review: EducationRefreshReview, source: EducationRefreshSource) => {
  const actor = source.accounts.find((account) => account.id === source.actorId);
  return Boolean(source.error || source.groupError) || review.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)
    || review.actorRevision !== actor.revision || review.revision !== source.revision || review.groupRevision !== source.groupRevision
    || source.accounts.find((account) => account.id === review.latest.id)?.revision !== review.latest.revision;
};
export function prepareEducationRefresh(editor: EducationRefreshEditor, source: EducationRefreshSource, now: string): EducationRefreshReview {
  const actor = actorFor(editor, source);
  const latest = source.accounts.find((account) => account.id === editor.account.id);
  if (!latest || latest.role !== "student") throw new Error("Учётка студента недоступна или её тип изменился. Дата и основание оставлены в форме; проверьте карточку.");
  const next = refreshed(editor, latest, source);
  const events = source.educationEvents.filter((event) => event.accountId === latest.id);
  const groupName = (id: string | undefined) => source.groups.find((group) => group.id === id)?.name ?? "Группа недоступна";
  return { operation: editor.educationOperation, latest: next.account, revision: source.revision, groupRevision: source.groupRevision, actorId: source.actorId, actorRevision: actor.revision, baseRevision: editor.revision, baseAccountRevision: editor.account.revision, baseGroupRevision: editor.educationGroupRevision, beforeGroup: groupName(getStudentGroupId(editor.account)), currentGroup: groupName(getStudentGroupId(latest)), targetGroup: editor.educationOperation === "transfer" && !selectedTransferTarget(editor) ? "Не выбрана" : groupName(getStudentGroupId(next.draft)), lastEventDate: events.at(-1)?.effectiveDate, problem: getEducationOperationProblem(latest, next.draft, next.educationOperation, next.education, events, source.groups, now) };
}
export function applyEducationRefresh(editor: EducationRefreshEditor, review: EducationRefreshReview, source: EducationRefreshSource): EducationRefreshEditor {
  actorFor(editor, source);
  if (editor.educationOperation !== review.operation || editor.account.id !== review.latest.id || editor.revision !== review.baseRevision || editor.account.revision !== review.baseAccountRevision || editor.educationGroupRevision !== review.baseGroupRevision || isEducationRefreshStale(review, source)) throw new Error("Учебные данные или сравнение снова изменились. Обновите сравнение перед продолжением.");
  return refreshed(editor, review.latest, source);
}
