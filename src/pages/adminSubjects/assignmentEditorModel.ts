import { isAccountActive, type PortalAccount } from "../../domain/accounts";

export interface AssignmentEditor {
  subjectId: string;
  account: PortalAccount;
  groups: string[];
  revision: number;
  actorId: string;
  actorRevision: number;
  catalogRevision: number;
  groupRevision: number;
}

interface AssignmentSources {
  accounts: PortalAccount[];
  revision: number;
  actorId: string;
  catalogRevision: number;
  groupRevision: number;
}

export const makeAssignmentEditor = (sources: AssignmentSources, subjectId: string, teacherId: string): AssignmentEditor => {
  const actor = sources.accounts.find((account) => account.id === sources.actorId);
  const teacher = sources.accounts.find((account) => account.id === teacherId && account.role === "teacher");
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Обновите учётную запись активного настройщика.");
  if (!teacher) throw new Error("Преподаватель недоступен. Выберите другого преподавателя.");
  return {
    subjectId, account: teacher,
    groups: [...(teacher.memberships.find((entry) => entry.subjectId === subjectId)?.groupIds ?? [])],
    revision: sources.revision, actorId: actor.id, actorRevision: actor.revision,
    catalogRevision: sources.catalogRevision, groupRevision: sources.groupRevision,
  };
};

export const isAssignmentEditorStale = (editor: AssignmentEditor, sources: AssignmentSources) => {
  const actor = sources.accounts.find((account) => account.id === sources.actorId);
  const teacher = sources.accounts.find((account) => account.id === editor.account.id);
  return sources.actorId !== editor.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)
    || actor.revision !== editor.actorRevision || sources.revision !== editor.revision
    || !teacher || teacher.role !== "teacher" || teacher.revision !== editor.account.revision
    || sources.catalogRevision !== editor.catalogRevision || sources.groupRevision !== editor.groupRevision;
};
