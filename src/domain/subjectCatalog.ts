import { isAccountActive, type PortalAccount } from "./accounts";

export interface SubjectDefinition {
  id: string;
  name: string;
  shortName: string;
  semester: string;
  color: "red" | "purple" | "orange" | "green";
}
export type SubjectDraft = Pick<SubjectDefinition, "name" | "shortName"> & Partial<Pick<SubjectDefinition, "semester" | "color">>;
export type SubjectCatalogDocument = {
  version: 1;
  revision: number;
  subjects: SubjectDefinition[];
  history: Array<{ id: string; subjectId: string; actorId: string; occurredAt: string; action: "created" }>;
};
export type CreateSubjectCommand = { actorId: string; actorRevision: number; expectedRevision: number; draft: SubjectDraft };

export const normalizeSubjectText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const lookupKey = (value: string) => normalizeSubjectText(value).toLocaleLowerCase("ru");
const colors = new Set(["red", "purple", "orange", "green"]);

export const validateSubjectDraft = (draft: SubjectDraft, subjects: SubjectDefinition[]) => {
  if (typeof draft.name !== "string" || typeof draft.shortName !== "string") throw new Error("Заполните название и сокращение дисциплины.");
  const name = normalizeSubjectText(draft.name);
  const shortName = normalizeSubjectText(draft.shortName);
  if (name.length < 2 || name.length > 160) throw new Error("Название дисциплины должно содержать от 2 до 160 символов.");
  if (!shortName || shortName.length > 24) throw new Error("Сокращение должно содержать от 1 до 24 символов.");
  if (subjects.some((subject) => lookupKey(subject.name) === lookupKey(name))) throw new Error("Дисциплина с таким названием уже существует.");
  if (subjects.some((subject) => lookupKey(subject.shortName) === lookupKey(shortName))) throw new Error("Это сокращение уже используется другой дисциплиной.");
  if (draft.semester !== undefined && (typeof draft.semester !== "string" || normalizeSubjectText(draft.semester).length > 160)) throw new Error("Проверьте описание дисциплины.");
  if (draft.color !== undefined && !colors.has(draft.color)) throw new Error("Выбран неизвестный цвет дисциплины.");
  return { name, shortName, semester: normalizeSubjectText(draft.semester ?? ""), color: draft.color ?? "red" };
};

export const createSubject = (state: SubjectCatalogDocument, command: CreateSubjectCommand, actor: PortalAccount | undefined, id: string, changeId: string, occurredAt: string): SubjectCatalogDocument => {
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Создание дисциплин доступно только активному настройщику.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) throw new Error("Каталог или учётная запись изменились. Обновите данные и повторите действие.");
  if (!id || state.subjects.some((subject) => subject.id === id)) throw new Error("Не удалось создать уникальную дисциплину.");
  const draft = validateSubjectDraft(command.draft, state.subjects);
  return { ...state, revision: state.revision + 1, subjects: [...state.subjects, { ...draft, id }], history: [...state.history, { id: changeId, subjectId: id, actorId: command.actorId, occurredAt, action: "created" }] };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export const decodeSubjectCatalog = (raw: string): SubjectCatalogDocument => {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.subjects) || !Array.isArray(value.history)) throw new Error("Неверный формат каталога дисциплин.");
  const subjects: SubjectDefinition[] = [];
  for (const subject of value.subjects) {
    if (!isRecord(subject) || typeof subject.id !== "string" || !subject.id || typeof subject.name !== "string" || typeof subject.shortName !== "string" || typeof subject.semester !== "string" || typeof subject.color !== "string" || !colors.has(subject.color) || subjects.some((entry) => entry.id === subject.id)) throw new Error("Повреждена дисциплина в каталоге.");
    validateSubjectDraft(subject as unknown as SubjectDefinition, subjects);
    subjects.push(subject as unknown as SubjectDefinition);
  }
  const historyIds = new Set<string>();
  for (const change of value.history) {
    if (!isRecord(change) || typeof change.id !== "string" || !change.id || historyIds.has(change.id) || typeof change.actorId !== "string" || !change.actorId || change.action !== "created" || typeof change.subjectId !== "string" || !subjects.some((subject) => subject.id === change.subjectId) || typeof change.occurredAt !== "string" || !Number.isFinite(Date.parse(change.occurredAt))) throw new Error("Повреждена история каталога дисциплин.");
    historyIds.add(change.id);
  }
  return value as SubjectCatalogDocument;
};
