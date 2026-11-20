import { isAccountActive, type PortalAccount } from "./accounts";

export const EDUCATION_DIRECTORIES_KEY = "bi-university-education-directories-v1";
export interface EducationProgram { id: string; revision: number; name: string; code: string }
export interface StudyForm { id: string; revision: number; name: string }
export type EducationDirectoryEvent = { id: string; actorId: string; occurredAt: string } & (
  | { entity: "program"; before: EducationProgram | null; after: EducationProgram }
  | { entity: "form"; before: StudyForm | null; after: StudyForm }
);
export interface EducationDirectoriesDocument {
  version: 1; revision: number; programs: EducationProgram[]; forms: StudyForm[]; history: EducationDirectoryEvent[];
}
export interface EducationDirectoryContext { actorId: string; actorRevision: number; expectedRevision: number }
export type EducationDirectoryCommand = EducationDirectoryContext & (
  | { entity: "program"; entityId?: string; entityRevision?: number; draft: { name: string; code: string } }
  | { entity: "form"; entityId?: string; entityRevision?: number; draft: { name: string } }
);
function fail(message = "Справочники программ и форм обучения повреждены."): never { throw new Error(message); }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const key = (value: string) => normalize(value).toLocaleLowerCase("ru-RU");
const text = (value: unknown, min = 1, max = 160): value is string => typeof value === "string" && value.length >= min && value.length <= max && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const id = (value: unknown): value is string => text(value) && value.trim() === value;
const revision = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validRecord = (value: unknown, entity: "program" | "form"): value is EducationProgram | StudyForm => exact(value, ["id", "revision", "name", ...(entity === "program" ? ["code"] : [])])
  && id(value.id) && revision(value.revision, 1) && text(value.name, 2) && normalize(value.name) === value.name
  && (entity === "form" || text(value.code, 0, 64) && normalize(value.code) === value.code);
const same = (left: EducationProgram | StudyForm | null | undefined, right: EducationProgram | StudyForm | null | undefined) => !left || !right ? left === right
  : left.id === right.id && left.revision === right.revision && left.name === right.name && ("code" in left ? left.code : undefined) === ("code" in right ? right.code : undefined);
export const emptyEducationDirectories = (): EducationDirectoriesDocument => ({ version: 1, revision: 0, programs: [], forms: [], history: [] });

/** Every saved record must be reproducible from its own snapshots; historical authority is checked separately. */
export const decodeEducationDirectories = (raw: string): EducationDirectoriesDocument => {
  if (typeof raw !== "string" || raw.length > 8 * 1024 * 1024) fail("Справочники программ превышают поддерживаемый размер.");
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "programs", "forms", "history"]) || value.version !== 1 || !revision(value.revision)
    || !Array.isArray(value.programs) || value.programs.length > 10_000 || !Array.isArray(value.forms) || value.forms.length > 1_000
    || !Array.isArray(value.history) || value.history.length > 50_000 || value.revision !== value.history.length) return fail();
  const programs = new Map<string, EducationProgram | StudyForm>(), forms = new Map<string, EducationProgram | StudyForm>();
  const names = { program: new Map<string, string>(), form: new Map<string, string>() }, ids = new Set<string>(), eventIds = new Set<string>();
  let previousTime = "";
  for (const event of value.history) {
    if (!exact(event, ["id", "actorId", "occurredAt", "entity", "before", "after"]) || !["program", "form"].includes(event.entity as string)
      || !id(event.id) || eventIds.has(event.id) || !id(event.actorId) || !timestamp(event.occurredAt) || event.occurredAt < previousTime) return fail();
    const entity = event.entity as "program" | "form", after = event.after;
    if (!validRecord(after, entity) || event.before !== null && !validRecord(event.before, entity)) return fail();
    const map = entity === "program" ? programs : forms, before = event.before as EducationProgram | StudyForm | null, current = map.get(after.id);
    if (before === null ? current !== undefined || ids.has(after.id) || after.revision !== 1 : !same(before, current) || after.revision !== before.revision + 1 || after.id !== before.id || after.name === before.name && ("code" in after ? after.code : undefined) === ("code" in before ? before.code : undefined)) return fail();
    const duplicate = names[entity].get(key(after.name));
    if (duplicate && duplicate !== after.id) fail("Название уже используется в этом справочнике.");
    if (before) names[entity].delete(key(before.name));
    map.set(after.id, after); names[entity].set(key(after.name), after.id); ids.add(after.id); eventIds.add(event.id); previousTime = event.occurredAt;
  }
  for (const [rows, map, entity] of [[value.programs, programs, "program"], [value.forms, forms, "form"]] as const) {
    if (rows.length !== map.size) fail();
    const seen = new Set<string>();
    for (const row of rows) {
      if (!validRecord(row, entity) || seen.has(row.id) || !same(row, map.get(row.id))) fail();
      seen.add(row.id);
    }
  }
  return value as unknown as EducationDirectoriesDocument;
};

export const executeEducationDirectoryCommand = (source: EducationDirectoriesDocument, command: EducationDirectoryCommand, actor: PortalAccount | undefined, metadata: { entityId: string; eventId: string; occurredAt: string }): EducationDirectoriesDocument => {
  const state = decodeEducationDirectories(JSON.stringify(source));
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) fail("Управлять программами и формами обучения может только действующий настройщик.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) fail("Справочник или права изменились. Обновите данные перед сохранением.");
  const updating = command.entityId !== undefined;
  if (!exact(command, ["entity", "actorId", "actorRevision", "expectedRevision", "draft", ...(updating ? ["entityId", "entityRevision"] : [])]) || !["program", "form"].includes(command.entity)
    || !exact(command.draft, command.entity === "program" ? ["name", "code"] : ["name"]) || typeof command.draft.name !== "string"
    || command.entity === "program" && typeof command.draft.code !== "string") fail("Проверьте данные программы или формы обучения.");
  if (!id(metadata.entityId) || !id(metadata.eventId) || !timestamp(metadata.occurredAt) || metadata.occurredAt < (state.history.at(-1)?.occurredAt ?? "")) fail("Не удалось подготовить ID или время изменения справочника.");
  const rows = command.entity === "program" ? state.programs : state.forms;
  const before = updating ? rows.find(row => row.id === command.entityId) : null;
  if (updating && (!before || !revision(command.entityRevision, 1) || before.revision !== command.entityRevision || metadata.entityId !== command.entityId)) fail("Запись справочника изменилась. Откройте актуальную карточку.");
  const after = { id: metadata.entityId, revision: (before?.revision ?? 0) + 1, name: normalize(command.draft.name), ...(command.entity === "program" ? { code: normalize(command.draft.code) } : {}) };
  if (!validRecord(after, command.entity)) fail("Название должно содержать от 2 до 160 символов, код программы — не более 64 символов.");
  if (before && before.name === after.name && ("code" in before ? before.code : undefined) === ("code" in after ? after.code : undefined)) fail("Данные не изменились.");
  const savedEvent = { id: metadata.eventId, actorId: actor.id, occurredAt: metadata.occurredAt, entity: command.entity, before: before ?? null, after };
  return decodeEducationDirectories(JSON.stringify({ ...state, revision: state.revision + 1,
    [command.entity === "program" ? "programs" : "forms"]: [...rows.filter(row => row.id !== after.id), after], history: [...state.history, savedEvent],
  }));
};
