import { isAccountActive, type PortalAccount } from "../../domain/accounts";
import type { GroupDraft, GroupValues } from "../../domain/groupCatalog";

export interface GroupEditor {
  draft: GroupDraft; baseline: string; groupId?: string; groupRevision: number;
  revision: number; actorId: string; actorRevision: number;
}
export interface GroupEditorSource {
  revision: number;
  groups: ({ id: string } & GroupValues)[];
  managed: { id: string; revision: number }[];
  actorId: string;
  accounts: PortalAccount[];
}
export interface GroupRefreshReview {
  groupId: string; groupRevision: number; revision: number; actorId: string; actorRevision: number;
  latest: GroupValues;
}
export const groupDraftFrom = (group: GroupValues, year: number): GroupDraft => ({ name: group.name, course: group.course, campus: group.campus ?? 0, admissionYear: group.admissionYear ?? year });
const activeActor = (source: GroupEditorSource) => {
  const actor = source.accounts.find((entry) => entry.id === source.actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Обновите учётную запись активного настройщика.");
  return actor;
};
export const isGroupEditorStale = (editor: Pick<GroupEditor, "groupId" | "groupRevision" | "revision" | "actorId" | "actorRevision">, source: GroupEditorSource) => {
  const actor = source.accounts.find((entry) => entry.id === source.actorId);
  return editor.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)
    || editor.actorRevision !== actor.revision || editor.revision !== source.revision
    || Boolean(editor.groupId && (!source.groups.some((group) => group.id === editor.groupId) || editor.groupRevision !== (source.managed.find((group) => group.id === editor.groupId)?.revision ?? 0)));
};
export const prepareGroupRefresh = (editor: GroupEditor, source: GroupEditorSource): { editor: GroupEditor; review: null } | { editor: null; review: GroupRefreshReview } => {
  const actor = activeActor(source);
  const group = source.groups.find((entry) => entry.id === editor.groupId);
  if (editor.groupId && !group) throw new Error("Группа больше недоступна. Введённые реквизиты оставлены в форме.");
  const groupRevision = source.managed.find((entry) => entry.id === editor.groupId)?.revision ?? 0;
  const versions = { revision: source.revision, actorId: actor.id, actorRevision: actor.revision, groupRevision };
  if (group && groupRevision !== editor.groupRevision) return { editor: null, review: { ...versions, groupId: group.id, latest: { name: group.name, course: group.course, campus: group.campus, admissionYear: group.admissionYear, status: group.status } } };
  return { editor: { ...editor, ...versions }, review: null };
};
export const applyGroupRefresh = (editor: GroupEditor, review: GroupRefreshReview, source: GroupEditorSource, choice: "draft" | "saved", year: number): GroupEditor => {
  if (editor.groupId !== review.groupId || isGroupEditorStale(review, source)) throw new Error("Данные сравнения изменились. Обновите сравнение перед выбором варианта.");
  const draft = choice === "saved" ? groupDraftFrom(review.latest, year) : { ...editor.draft };
  return { ...editor, draft, baseline: JSON.stringify(groupDraftFrom(review.latest, year)), revision: review.revision, groupRevision: review.groupRevision, actorId: review.actorId, actorRevision: review.actorRevision };
};
