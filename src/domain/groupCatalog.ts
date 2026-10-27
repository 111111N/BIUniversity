import { isAccountActive, type PortalAccount } from "./accounts";

export interface GroupDraft { name: string; course: number; campus: number; admissionYear: number }
export type GroupStatus = "active" | "archived";
export interface GroupValues { name: string; course: number; campus?: number; admissionYear?: number; status?: GroupStatus }
export interface ManagedGroup extends GroupDraft { id: string; revision: number; createdAt: string; createdBy: string; updatedAt?: string; status?: GroupStatus; previousNames?: string[]; source?: "initial" }
export interface GroupChange { id: string; groupId: string; actorId: string; occurredAt: string; action: "created" | "updated" | "archived" | "restored"; before?: GroupValues; after?: GroupValues }
export interface GroupCatalogDocument {
  version: 1;
  revision: number;
  groups: ManagedGroup[];
  history: GroupChange[];
}
export interface CreateGroupCommand { actorId: string; actorRevision: number; expectedRevision: number; draft: GroupDraft }
export interface GroupTargetCommand { actorId: string; actorRevision: number; expectedRevision: number; groupId: string; groupRevision: number }
export interface UpdateGroupCommand extends GroupTargetCommand { draft: GroupDraft }
export interface GroupDependencies { students: number; teachingAssignments: number; draftLessons: number; futurePublishedLessons: number; pastPublishedLessons: number }
export interface ChangeGroupStatusCommand extends GroupTargetCommand { status: GroupStatus; expectedAccountsRevision: number; expectedScheduleRevision: number }
export const isGroupActive = (group: { status?: GroupStatus }) => group.status !== "archived";
export const emptyGroupCatalog = (): GroupCatalogDocument => ({ version: 1, revision: 0, groups: [], history: [] });
export const normalizeGroupName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ");
export const groupNameKey = (name: string) => normalizeGroupName(name).toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
export interface GroupDraftError { field: keyof GroupDraft; message: string }
export const getGroupDraftErrors = (draft: GroupDraft): GroupDraftError[] => {
  const errors: GroupDraftError[] = [];
  if (typeof draft.name !== "string") errors.push({ field: "name", message: "Укажите название группы." });
  else {
    const name = normalizeGroupName(draft.name);
    if (name.length < 2 || name.length > 80) errors.push({ field: "name", message: "Название группы: от 2 до 80 символов." });
  }
  if (!Number.isInteger(draft.course) || draft.course < 1 || draft.course > 12) errors.push({ field: "course", message: "Курс должен быть целым числом от 1 до 12." });
  if (!Number.isInteger(draft.campus) || draft.campus < 1 || draft.campus > 9) errors.push({ field: "campus", message: "Выберите один из девяти учебных корпусов." });
  if (!Number.isInteger(draft.admissionYear) || draft.admissionYear < 1900 || draft.admissionYear > 2199) errors.push({ field: "admissionYear", message: "Укажите четырёхзначный год набора от 1900 до 2199." });
  return errors;
};
export const validateGroupDraft = (draft: GroupDraft): GroupDraft => {
  const [error] = getGroupDraftErrors(draft);
  if (error) throw new Error(error.message);
  return { name: normalizeGroupName(draft.name), course: draft.course, campus: draft.campus, admissionYear: draft.admissionYear };
};

export const createAcademicGroup = (state: GroupCatalogDocument, command: CreateGroupCommand, actor: PortalAccount | undefined, existing: ReadonlyArray<{ id: string; name: string }>, id: string, historyId: string, occurredAt: string): GroupCatalogDocument => {
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Создавать группы может только активный настройщик.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) throw new Error("Справочник групп или права изменились. Обновите данные и повторите действие.");
  const draft = validateGroupDraft(command.draft);
  const all = [...existing, ...state.groups];
  if (all.some((group) => groupNameKey(group.name) === groupNameKey(draft.name) || ("previousNames" in group && (group.previousNames as string[] | undefined)?.some((name) => groupNameKey(name) === groupNameKey(draft.name))))) throw new Error("Группа с таким названием уже существует.");
  if (!id || all.some((group) => group.id === id) || !historyId || state.history.some((entry) => entry.id === historyId) || !Number.isFinite(Date.parse(occurredAt))) throw new Error("Не удалось подготовить создание группы.");
  return { ...state, revision: state.revision + 1, groups: [...state.groups, { ...draft, id, revision: 1, createdAt: occurredAt, createdBy: actor.id }], history: [...state.history, { id: historyId, groupId: id, actorId: actor.id, occurredAt, action: "created" }] };
};

const groupValues = (group: GroupValues): GroupValues => ({ name: group.name, course: group.course, ...(group.campus ? { campus: group.campus } : {}), ...(group.admissionYear ? { admissionYear: group.admissionYear } : {}), status: group.status ?? "active" });
export const authorizeGroupTarget = (state: GroupCatalogDocument, command: GroupTargetCommand, actor: PortalAccount | undefined, initial: ReadonlyArray<{ id: string } & GroupValues>) => {
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Изменять группы может только активный настройщик.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) throw new Error("Справочник групп или права изменились. Обновите данные и повторите действие.");
  const managed = state.groups.find((group) => group.id === command.groupId);
  const group = managed ?? initial.find((group) => group.id === command.groupId);
  if (!group) throw new Error("Группа не найдена.");
  if ((managed?.revision ?? 0) !== command.groupRevision) throw new Error("Реквизиты группы изменились. Сверьте актуальные данные перед сохранением.");
  return { group, managed };
};
const appendGroupChange = (state: GroupCatalogDocument, group: ManagedGroup, change: GroupChange): GroupCatalogDocument => {
  if (!change.id || state.history.some((entry) => entry.id === change.id) || !Number.isFinite(Date.parse(change.occurredAt))) throw new Error("Не удалось подготовить запись истории группы.");
  return { ...state, revision: state.revision + 1, groups: [...state.groups.filter((entry) => entry.id !== group.id), group], history: [...state.history, change] };
};
export const updateAcademicGroup = (state: GroupCatalogDocument, command: UpdateGroupCommand, actor: PortalAccount | undefined, initial: ReadonlyArray<{ id: string } & GroupValues>, changeId: string, occurredAt: string) => {
  const { group, managed } = authorizeGroupTarget(state, command, actor, initial);
  const draft = validateGroupDraft(command.draft);
  const key = groupNameKey(draft.name);
  if ([...initial, ...state.groups].some((entry) => entry.id !== group.id && (groupNameKey(entry.name) === key || ("previousNames" in entry && (entry.previousNames as string[] | undefined)?.some((name) => groupNameKey(name) === key))))) throw new Error("Название уже используется другой группой или сохранено в её истории.");
  if (JSON.stringify(groupValues(group)) === JSON.stringify(groupValues({ ...draft, status: group.status }))) throw new Error("Реквизиты группы не изменились.");
  const previousNames = [...new Set([...(managed?.previousNames ?? []), ...(group.name !== draft.name ? [group.name] : [])])].filter((name) => name !== draft.name);
  const next: ManagedGroup = { ...(managed ?? { id: group.id, createdAt: occurredAt, createdBy: actor!.id, source: "initial" as const }), ...draft, revision: (managed?.revision ?? 0) + 1, updatedAt: occurredAt, ...(previousNames.length ? { previousNames } : { previousNames: [] }) };
  return appendGroupChange(state, next, { id: changeId, groupId: group.id, actorId: actor!.id, occurredAt, action: "updated", before: groupValues(group), after: groupValues(next) });
};
export const groupArchiveBlockers = (dependencies: GroupDependencies) => [
  ...(dependencies.students ? [`В группе ещё учатся студенты: ${dependencies.students}. Сначала оформите перевод, выпуск или отчисление.`] : []),
  ...(dependencies.teachingAssignments ? [`Назначения преподавателей: ${dependencies.teachingAssignments}. Сначала снимите назначения в дисциплинах.`] : []),
  ...(dependencies.draftLessons ? [`Пары в черновиках: ${dependencies.draftLessons}. Сначала разберите и сохраните черновики.`] : []),
  ...(dependencies.futurePublishedLessons ? [`Будущие опубликованные пары: ${dependencies.futurePublishedLessons}. Сначала отмените или перенесите их и опубликуйте изменения.`] : []),
];
export const changeAcademicGroupStatus = (state: GroupCatalogDocument, command: ChangeGroupStatusCommand, actor: PortalAccount | undefined, initial: ReadonlyArray<{ id: string } & GroupValues>, dependencies: GroupDependencies, changeId: string, occurredAt: string) => {
  const { group, managed } = authorizeGroupTarget(state, command, actor, initial);
  if (!managed) throw new Error("Сначала заполните реквизиты исходной группы через редактирование.");
  if (!["active", "archived"].includes(command.status) || (group.status ?? "active") === command.status) throw new Error("Выберите другое допустимое состояние группы.");
  if (command.status === "archived") { const blockers = groupArchiveBlockers(dependencies); if (blockers.length) throw new Error(blockers.join("\n")); }
  const next: ManagedGroup = { ...managed, status: command.status, revision: managed.revision + 1, updatedAt: occurredAt };
  return appendGroupChange(state, next, { id: changeId, groupId: group.id, actorId: actor!.id, occurredAt, action: command.status === "archived" ? "archived" : "restored", before: groupValues(group), after: groupValues(next) });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const decodeGroupCatalog = (raw: string): GroupCatalogDocument => {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.groups) || !Array.isArray(value.history)) throw new Error("Неверный формат справочника групп.");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const group of value.groups) {
    if (!isRecord(group) || typeof group.id !== "string" || !group.id.trim() || !Number.isSafeInteger(group.revision) || Number(group.revision) < 1 || typeof group.createdAt !== "string" || !Number.isFinite(Date.parse(group.createdAt)) || typeof group.createdBy !== "string" || !group.createdBy.trim()) throw new Error("Повреждены сведения о группе.");
    const draft = validateGroupDraft(group as unknown as GroupDraft);
    if ((group.status !== undefined && !["active", "archived"].includes(String(group.status))) || (group.updatedAt !== undefined && (typeof group.updatedAt !== "string" || !Number.isFinite(Date.parse(group.updatedAt)))) || (group.source !== undefined && group.source !== "initial") || (group.previousNames !== undefined && (!Array.isArray(group.previousNames) || group.previousNames.some((name) => typeof name !== "string" || normalizeGroupName(name).length < 2 || name.length > 80)))) throw new Error("Повреждены состояние или прежние названия группы.");
    if (ids.has(group.id) || names.has(groupNameKey(draft.name))) throw new Error("В справочнике повторяются группы.");
    ids.add(group.id); names.add(groupNameKey(draft.name));
  }
  const owners = new Map<string, string>();
  for (const group of value.groups as ManagedGroup[]) for (const name of [group.name, ...(group.previousNames ?? [])]) { const key = groupNameKey(name); if (owners.has(key) && owners.get(key) !== group.id) throw new Error("Исторические названия групп пересекаются."); owners.set(key, group.id); }
  const historyIds = new Set<string>();
  for (const entry of value.history) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim() || historyIds.has(entry.id) || typeof entry.groupId !== "string" || !ids.has(entry.groupId) || !["created", "updated", "archived", "restored"].includes(String(entry.action)) || typeof entry.actorId !== "string" || !entry.actorId.trim() || typeof entry.occurredAt !== "string" || !Number.isFinite(Date.parse(entry.occurredAt))) throw new Error("Повреждена история справочника групп.");
    if (entry.action !== "created" || entry.before !== undefined || entry.after !== undefined) {
      for (const snapshot of [entry.before, entry.after]) if (!isRecord(snapshot) || typeof snapshot.name !== "string" || normalizeGroupName(snapshot.name).length < 2 || snapshot.name.length > 80 || !Number.isInteger(snapshot.course) || Number(snapshot.course) < 1 || Number(snapshot.course) > 12 || (snapshot.campus !== undefined && (!Number.isInteger(snapshot.campus) || Number(snapshot.campus) < 1 || Number(snapshot.campus) > 9)) || (snapshot.admissionYear !== undefined && (!Number.isInteger(snapshot.admissionYear) || Number(snapshot.admissionYear) < 1900 || Number(snapshot.admissionYear) > 2199)) || !["active", "archived"].includes(String(snapshot.status))) throw new Error("Повреждены значения истории группы.");
    }
    historyIds.add(entry.id);
  }
  return value as unknown as GroupCatalogDocument;
};
