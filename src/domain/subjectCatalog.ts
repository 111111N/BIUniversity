import { isAccountActive, type PortalAccount } from "./accounts";

export interface SubjectDefinition {
  id: string;
  name: string;
  shortName: string;
  semester: string;
  color: "red" | "purple" | "orange" | "green";
  revision?: number;
  status?: "active" | "archived";
  previousNames?: string[];
}
export interface SubjectChange {
  id: string; subjectId: string; actorId: string; occurredAt: string;
  action: "created" | "updated" | "archived" | "restored";
  before?: SubjectDefinition | null; after?: SubjectDefinition; origin?: "saved-snapshot";
}
export type SubjectDraft = Pick<SubjectDefinition, "name" | "shortName"> & Partial<Pick<SubjectDefinition, "semester" | "color">>;
export type SubjectCatalogDocument = {
  version: 1 | 2;
  revision: number;
  subjects: SubjectDefinition[];
  history: SubjectChange[];
  legacy?: { revision: number; historyLength: number };
};
export type CreateSubjectCommand = { actorId: string; actorRevision: number; expectedRevision: number; draft: SubjectDraft };
export type SubjectTargetCommand = Omit<CreateSubjectCommand, "draft"> & { subjectId: string; subjectRevision: number };
export type UpdateSubjectCommand = SubjectTargetCommand & { draft: SubjectDraft };
export interface SubjectDependencies { teachingAssignments: number; draftLessons: number; futurePublishedLessons: number; unfinishedAssessments: number }
export type ChangeSubjectStatusCommand = SubjectTargetCommand & { status: "active" | "archived"; expectedAccountsRevision: number; expectedScheduleRevision: number; expectedAssessmentRevision: number };
export const isSubjectActive = (subject: Pick<SubjectDefinition, "status">) => subject.status !== "archived";

export const normalizeSubjectText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const subjectNameKey = (value: string) => normalizeSubjectText(value).toLocaleLowerCase("ru");
const lookupKey = subjectNameKey;
const colors = new Set(["red", "purple", "orange", "green"]);

export type SubjectIdentityField = "name" | "shortName";
export type SubjectDraftError = { field: SubjectIdentityField; message: string };
export const getSubjectDraftErrors = (draft: Pick<SubjectDraft, SubjectIdentityField>, subjects: SubjectDefinition[], excludedId?: string): SubjectDraftError[] => {
  if (typeof draft.name !== "string" || typeof draft.shortName !== "string") {
    return (["name", "shortName"] as const).filter((field) => typeof draft[field] !== "string")
      .map((field) => ({ field, message: "Заполните название и сокращение дисциплины." }));
  }
  const name = normalizeSubjectText(draft.name);
  const shortName = normalizeSubjectText(draft.shortName);
  const nameKey = lookupKey(name);
  const shortNameKey = lookupKey(shortName);
  const errors: SubjectDraftError[] = [];
  if (name.length < 2 || name.length > 160) errors.push({ field: "name", message: "Название дисциплины должно содержать от 2 до 160 символов." });
  if (!shortName || shortName.length > 24) errors.push({ field: "shortName", message: "Сокращение должно содержать от 1 до 24 символов." });
  if (subjects.some((subject) => subject.id !== excludedId && [subject.name, ...(subject.previousNames ?? [])].some(name => lookupKey(name) === nameKey))) errors.push({ field: "name", message: "Дисциплина с таким названием уже существует или название сохранено в её истории." });
  if (subjects.some((subject) => subject.id !== excludedId && lookupKey(subject.shortName) === shortNameKey)) errors.push({ field: "shortName", message: "Это сокращение уже используется другой дисциплиной." });
  return errors;
};

export const validateSubjectDraft = (draft: SubjectDraft, subjects: SubjectDefinition[], excludedId?: string) => {
  const errors = getSubjectDraftErrors(draft, subjects, excludedId);
  if (errors.length) throw new Error(errors[0].message);
  const name = normalizeSubjectText(draft.name);
  const shortName = normalizeSubjectText(draft.shortName);
  if (draft.semester !== undefined && (typeof draft.semester !== "string" || normalizeSubjectText(draft.semester).length > 160)) throw new Error("Проверьте описание дисциплины.");
  if (draft.color !== undefined && !colors.has(draft.color)) throw new Error("Выбран неизвестный цвет дисциплины.");
  return { name, shortName, semester: normalizeSubjectText(draft.semester ?? ""), color: draft.color ?? "red" };
};

const authorize = (state: SubjectCatalogDocument, command: Omit<CreateSubjectCommand, "draft">, actor: PortalAccount | undefined) => {
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Управление дисциплинами доступно только активному настройщику.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) throw new Error("Каталог или учётная запись изменились. Обновите данные и повторите действие.");
};
export const authorizeSubjectTarget = (state: SubjectCatalogDocument, command: SubjectTargetCommand, actor: PortalAccount | undefined) => {
  authorize(state, command, actor);
  const subject = state.subjects.find(row => row.id === command.subjectId);
  if (!subject || (subject.revision ?? 0) !== command.subjectRevision) throw new Error("Дисциплина изменена или недоступна. Обновите данные и повторите действие.");
  return subject;
};
const stable = (value: unknown): string => JSON.stringify(value, (_key, row) => row && typeof row === "object" && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : row);
const renamedAliases = (subject: SubjectDefinition, name: string) => [...new Map([...(subject.previousNames ?? []), ...(subject.name !== name ? [subject.name] : [])].map(normalizeSubjectText).filter(previous => lookupKey(previous) !== lookupKey(name)).map(previous => [lookupKey(previous), previous])).values()];
const append = (state: SubjectCatalogDocument, subject: SubjectDefinition, event: SubjectChange): SubjectCatalogDocument => {
  if (!event.id.trim() || state.history.some(row => row.id === event.id) || !/Z$|[+-]\d{2}:\d{2}$/.test(event.occurredAt) || !Number.isFinite(Date.parse(event.occurredAt)) || state.history.some(row => Date.parse(row.occurredAt) > Date.parse(event.occurredAt))) throw new Error("Не удалось сформировать изменение или нарушен порядок истории дисциплин.");
  const next: SubjectCatalogDocument = { ...state, version: 2, legacy: state.version === 1 ? { revision: state.revision, historyLength: state.history.length } : state.legacy, revision: state.revision + 1,
    subjects: state.subjects.some(row => row.id === subject.id) ? state.subjects.map(row => row.id === subject.id ? subject : row) : [...state.subjects, subject], history: [...state.history, event] };
  return decodeSubjectCatalog(JSON.stringify(next));
};
export const createSubject = (state: SubjectCatalogDocument, command: CreateSubjectCommand, actor: PortalAccount | undefined, id: string, changeId: string, occurredAt: string): SubjectCatalogDocument => {
  authorize(state, command, actor);
  if (!id || state.subjects.some((subject) => subject.id === id)) throw new Error("Не удалось создать уникальную дисциплину.");
  const draft = validateSubjectDraft(command.draft, state.subjects);
  const subject: SubjectDefinition = { ...draft, id, revision: 1, status: "active", previousNames: [] };
  return append(state, subject, { id: changeId, subjectId: id, actorId: command.actorId, occurredAt, action: "created", before: null, after: structuredClone(subject) });
};
export const updateSubject = (state: SubjectCatalogDocument, command: UpdateSubjectCommand, actor: PortalAccount | undefined, changeId: string, occurredAt: string): SubjectCatalogDocument => {
  const previous = authorizeSubjectTarget(state, command, actor);
  if (!isSubjectActive(previous)) throw new Error("Сначала восстановите дисциплину из архива.");
  const draft = validateSubjectDraft({ ...previous, ...command.draft }, state.subjects, previous.id);
  if ((["name", "shortName", "semester", "color"] as const).every(field => draft[field] === previous[field])) throw new Error("Реквизиты дисциплины не изменились.");
  const next: SubjectDefinition = { ...previous, ...draft, revision: (previous.revision ?? 0) + 1, status: "active", previousNames: renamedAliases(previous, draft.name) };
  return append(state, next, { id: changeId, subjectId: previous.id, actorId: command.actorId, occurredAt, action: "updated", before: structuredClone(previous), after: structuredClone(next), ...(previous.revision === undefined ? { origin: "saved-snapshot" as const } : {}) });
};
export const subjectArchiveBlockers = (dependencies: SubjectDependencies) => [
  ...(dependencies.teachingAssignments ? [`Назначения преподавателей: ${dependencies.teachingAssignments}. Сначала снимите назначения.`] : []),
  ...(dependencies.draftLessons ? [`Пары в черновиках: ${dependencies.draftLessons}. Сначала разберите черновики.`] : []),
  ...(dependencies.futurePublishedLessons ? [`Будущие опубликованные пары: ${dependencies.futurePublishedLessons}. Сначала отмените или перенесите занятия и опубликуйте изменения.`] : []),
  ...(dependencies.unfinishedAssessments ? [`Незавершённые аттестации: ${dependencies.unfinishedAssessments}. Сначала завершите ведомости и исправления либо отмените пустые попытки.`] : []),
];
export const changeSubjectStatus = (state: SubjectCatalogDocument, command: ChangeSubjectStatusCommand, actor: PortalAccount | undefined, dependencies: SubjectDependencies, changeId: string, occurredAt: string): SubjectCatalogDocument => {
  const previous = authorizeSubjectTarget(state, command, actor);
  if (!["active", "archived"].includes(command.status) || (previous.status ?? "active") === command.status) throw new Error("Выберите другое допустимое состояние дисциплины.");
  if (command.status === "archived") { const blockers = subjectArchiveBlockers(dependencies); if (blockers.length) throw new Error(blockers.join("\n")); }
  const next: SubjectDefinition = { ...previous, revision: (previous.revision ?? 0) + 1, status: command.status, previousNames: [...(previous.previousNames ?? [])] };
  return append(state, next, { id: changeId, subjectId: previous.id, actorId: command.actorId, occurredAt, action: command.status === "archived" ? "archived" : "restored", before: structuredClone(previous), after: structuredClone(next), ...(previous.revision === undefined ? { origin: "saved-snapshot" as const } : {}) });
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const decodeSubjectCatalog = (raw: string): SubjectCatalogDocument => {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.subjects) || !Array.isArray(value.history) || value.subjects.length > 25_000 || value.history.length > 50_000) throw new Error("Неверный формат каталога дисциплин.");
  const subjects: SubjectDefinition[] = [];
  for (const subject of value.subjects) {
    if (!isRecord(subject) || typeof subject.id !== "string" || !subject.id || typeof subject.name !== "string" || typeof subject.shortName !== "string" || typeof subject.semester !== "string" || typeof subject.color !== "string" || !colors.has(subject.color) || subjects.some((entry) => entry.id === subject.id)) throw new Error("Повреждена дисциплина в каталоге.");
    validateSubjectDraft(subject as unknown as SubjectDefinition, subjects);
    if (subject.status !== undefined && !["active", "archived"].includes(String(subject.status)) || subject.revision !== undefined && (!Number.isSafeInteger(subject.revision) || Number(subject.revision) < 1) || subject.previousNames !== undefined && (!Array.isArray(subject.previousNames) || subject.previousNames.some(name => typeof name !== "string" || normalizeSubjectText(name) !== name || name.length < 2 || name.length > 160))) throw new Error("Повреждены состояние или прежние названия дисциплины.");
    if (value.version === 1 && ["status", "revision", "previousNames"].some(key => subject[key] !== undefined)) throw new Error("Состояние дисциплины требует нового формата каталога.");
    subjects.push(subject as unknown as SubjectDefinition);
  }
  const historyIds = new Set<string>();
  const byId = new Map(subjects.map(subject => [subject.id, subject]));
  const legacy = value.version === 1 ? { revision: value.revision as number, historyLength: value.history.length } : value.legacy;
  if (!isRecord(legacy) || !Number.isSafeInteger(legacy.revision) || Number(legacy.revision) < 0 || !Number.isSafeInteger(legacy.historyLength) || Number(legacy.historyLength) < 0 || Number(legacy.historyLength) > value.history.length || value.version === 2 && value.revision !== Number(legacy.revision) + value.history.length - Number(legacy.historyLength)) throw new Error("Повреждена граница старой истории дисциплин.");
  const replay = new Map<string, SubjectDefinition>(), legacyCreated = new Set<string>(); let previousTime = -Infinity;
  const fail = (): never => { throw new Error("Повреждена история каталога дисциплин или её снимки."); };
  for (let index = 0; index < value.history.length; index++) {
    const change = value.history[index];
    if (!isRecord(change) || typeof change.id !== "string" || !change.id || historyIds.has(change.id) || typeof change.actorId !== "string" || !change.actorId || typeof change.subjectId !== "string" || !byId.has(change.subjectId) || typeof change.occurredAt !== "string" || !Number.isFinite(Date.parse(change.occurredAt))) fail();
    historyIds.add(change.id);
    const time = Date.parse(change.occurredAt);
    if (index < Number(legacy.historyLength)) { if (change.action !== "created" || change.before !== undefined || change.after !== undefined || change.origin !== undefined) fail(); legacyCreated.add(change.subjectId); previousTime = Math.max(previousTime, time); continue; }
    if (time < previousTime || !isRecord(change.after) || change.after.id !== change.subjectId) fail(); previousTime = time;
    const after = change.after as unknown as SubjectDefinition;
    validateSubjectDraft(after, []);
    const current = replay.get(change.subjectId);
    if (change.action === "created") {
      if (change.before !== null || current || after.revision !== 1 || after.status !== "active" || stable(after.previousNames) !== "[]" || change.origin !== undefined || legacyCreated.has(change.subjectId)) fail();
    } else {
      if (!isRecord(change.before) || change.before.id !== change.subjectId) fail();
      const before = change.before as unknown as SubjectDefinition;
      validateSubjectDraft(before, []);
      if (current ? stable(current) !== stable(before) || change.origin !== undefined : [before.revision, before.status, before.previousNames].some(value => value !== undefined) || change.origin !== "saved-snapshot") fail();
      if (after.revision !== (before.revision ?? 0) + 1) fail();
      const base = { ...before, revision: after.revision, status: after.status, previousNames: after.previousNames };
      if (change.action === "updated") {
        if (!isSubjectActive(before) || after.status !== "active" || stable(after.previousNames) !== stable(renamedAliases(before, after.name)) || stable(after) !== stable({ ...base, name: after.name, shortName: after.shortName, semester: after.semester, color: after.color })) fail();
      } else if (change.action === "archived" || change.action === "restored") {
        if ((change.action === "archived") !== isSubjectActive(before) || after.status !== (change.action === "archived" ? "archived" : "active") || stable(after.previousNames) !== stable(before.previousNames ?? []) || stable(after) !== stable(base)) fail();
      } else fail();
    }
    replay.set(change.subjectId, after);
  }
  const names = new Map<string, string>();
  for (const subject of subjects) {
    if (subject.revision !== undefined ? stable(replay.get(subject.id)) !== stable(subject) : replay.has(subject.id)) fail();
    if (subject.revision === undefined && (subject.status !== undefined || subject.previousNames !== undefined)) fail();
    for (const name of [subject.name, ...(subject.previousNames ?? [])]) {
      const key = lookupKey(name); if (names.has(key)) fail(); names.set(key, subject.id);
    }
  }
  return value as SubjectCatalogDocument;
};
