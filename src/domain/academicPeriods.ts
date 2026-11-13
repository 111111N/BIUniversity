import { isAccountActive, type PortalAccount } from "./accounts";

export const ACADEMIC_PERIODS_STORAGE_KEY = "bi-university-academic-periods-v1";

export interface AcademicYear {
  id: string; revision: number; name: string; startsOn: string; endsOn: string;
}
export interface AcademicTerm extends AcademicYear { yearId: string }
export interface AcademicPeriodDraft { name: string; startsOn: string; endsOn: string }
export type AcademicPeriodEvent = {
  id: string; actorId: string; occurredAt: string; action: "created" | "updated";
} & (
  | { entity: "year"; before: AcademicYear | null; after: AcademicYear }
  | { entity: "term"; before: AcademicTerm | null; after: AcademicTerm }
);
export interface AcademicPeriodsDocument {
  version: 1; revision: number; years: AcademicYear[]; terms: AcademicTerm[]; history: AcademicPeriodEvent[];
}
export interface AcademicPeriodContext { actorId: string; actorRevision: number; expectedRevision: number }
export type AcademicPeriodCommand = AcademicPeriodContext & (
  | { type: "create-year"; draft: AcademicPeriodDraft }
  | { type: "update-year"; yearId: string; entityRevision: number; draft: AcademicPeriodDraft }
  | { type: "create-term"; yearId: string; draft: AcademicPeriodDraft }
  | { type: "update-term"; termId: string; entityRevision: number; draft: AcademicPeriodDraft }
);
export const emptyAcademicPeriodsDocument = (): AcademicPeriodsDocument => ({ version: 1, revision: 0, years: [], terms: [], history: [] });

function fail(message = "Не читается справочник учебных периодов: схема или история изменений повреждена."): never { throw new Error(message); }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const exact = (value: unknown, fields: readonly string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
const containsControl = (value: string) => Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !containsControl(value);
const integer = (value: unknown, minimum: number): value is number => Number.isSafeInteger(value) && (value as number) >= minimum;
const normalizeName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const nameKey = (value: string) => normalizeName(value).toLocaleLowerCase("ru-RU");
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Calendar days are inclusive and independent of the browser's timezone. */
export const isAcademicCalendarDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const validDraft = (value: unknown): value is AcademicPeriodDraft => object(value)
  && typeof value.name === "string" && value.name.length >= 2 && value.name.length <= 160 && normalizeName(value.name) === value.name && !containsControl(value.name)
  && isAcademicCalendarDate(value.startsOn) && isAcademicCalendarDate(value.endsOn) && value.startsOn <= value.endsOn;
const yearFields = ["id", "revision", "name", "startsOn", "endsOn"];
const termFields = [...yearFields, "yearId"];
const validRecord = (value: unknown, entity: "year" | "term"): value is AcademicYear | AcademicTerm => exact(value, entity === "year" ? yearFields : termFields)
  && identifier(value.id) && integer(value.revision, 1) && validDraft(value) && (entity === "year" || identifier(value.yearId));
const sameRecord = (left: AcademicYear | null, right: AcademicYear | undefined | null): boolean => left === null ? right == null
  : Boolean(right && left.id === right.id && left.revision === right.revision && left.name === right.name && left.startsOn === right.startsOn && left.endsOn === right.endsOn
    && ("yearId" in left ? (left as AcademicTerm).yearId : undefined) === (right && "yearId" in right ? (right as AcademicTerm).yearId : undefined));
const changed = (left: AcademicYear, right: AcademicYear) => left.name !== right.name || left.startsOn !== right.startsOn || left.endsOn !== right.endsOn;
const insideYear = (term: AcademicTerm, year: AcademicYear) => year.startsOn <= term.startsOn && term.endsOn <= year.endsOn;

interface PeriodIndex {
  years: Map<string, AcademicYear>; terms: Map<string, AcademicTerm>;
  yearNames: Map<string, string>; termNames: Map<string, Map<string, string>>; children: Map<string, Set<string>>;
}
const emptyIndex = (): PeriodIndex => ({ years: new Map(), terms: new Map(), yearNames: new Map(), termNames: new Map(), children: new Map() });
const applyEvent = (index: PeriodIndex, event: AcademicPeriodEvent) => {
  const { after, before } = event;
  const previous = event.entity === "year" ? index.years.get(after.id) : index.terms.get(after.id);
  if (!sameRecord(before, previous) || (event.action === "created" ? before !== null || after.revision !== 1 || index.years.has(after.id) || index.terms.has(after.id)
    : !previous || !before || after.revision !== before.revision + 1 || after.id !== before.id || !changed(before, after))) fail();
  if (event.entity === "year") {
    const duplicate = index.yearNames.get(nameKey(event.after.name));
    if (duplicate && duplicate !== after.id) fail("Учебный год с таким названием уже существует.");
    for (const id of index.children.get(after.id) ?? []) if (!insideYear(index.terms.get(id)!, after)) fail("Границы года не могут исключать входящие в него семестры.");
    if (before) index.yearNames.delete(nameKey(before.name));
    index.yearNames.set(nameKey(after.name), after.id); index.years.set(after.id, event.after);
  } else {
    const term = event.after, year = index.years.get(term.yearId);
    if (!year || !insideYear(term, year)) fail("Семестр должен полностью входить в выбранный учебный год.");
    if (event.before && event.before.yearId !== term.yearId) fail("Нельзя переносить существующий семестр в другой учебный год.");
    const names = index.termNames.get(term.yearId) ?? new Map<string, string>(), duplicate = names.get(nameKey(term.name));
    if (duplicate && duplicate !== after.id) fail("Семестр с таким названием уже существует в выбранном году.");
    if (before) names.delete(nameKey(before.name));
    names.set(nameKey(term.name), term.id); index.termNames.set(term.yearId, names);
    const children = index.children.get(term.yearId) ?? new Set<string>(); children.add(term.id); index.children.set(term.yearId, children);
    index.terms.set(term.id, term);
  }
};

/** Replaying snapshots checks consistency, not the historical authority of their authors. */
export const decodeAcademicPeriodsDocument = (raw: string): AcademicPeriodsDocument => {
  if (typeof raw !== "string" || raw.length > 8 * 1024 * 1024) fail("Справочник учебных периодов превышает поддерживаемый размер.");
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "years", "terms", "history"]) || value.version !== 1 || !integer(value.revision, 0)
    || !Array.isArray(value.years) || value.years.length > 1_000 || !Array.isArray(value.terms) || value.terms.length > 10_000
    || !Array.isArray(value.history) || value.history.length > 50_000 || value.revision !== value.history.length) return fail();
  const index = emptyIndex(), ids = new Set<string>(); let previousTime = "";
  for (const row of value.history) {
    if (!exact(row, ["id", "actorId", "occurredAt", "action", "entity", "before", "after"]) || !identifier(row.id) || ids.has(row.id)
      || !identifier(row.actorId) || !timestamp(row.occurredAt) || row.occurredAt < previousTime || !["created", "updated"].includes(row.action as string)
      || (row.entity !== "year" && row.entity !== "term") || !validRecord(row.after, row.entity) || (row.before !== null && !validRecord(row.before, row.entity))) return fail();
    ids.add(row.id); previousTime = row.occurredAt; applyEvent(index, row as unknown as AcademicPeriodEvent);
  }
  for (const [entity, rows, records] of [["year", value.years, index.years], ["term", value.terms, index.terms]] as const) {
    const recordIds = new Set<string>();
    if (rows.length !== records.size) return fail();
    for (const row of rows) {
      if (!validRecord(row, entity) || recordIds.has(row.id) || !sameRecord(row, records.get(row.id))) return fail();
      recordIds.add(row.id);
    }
  }
  return value as unknown as AcademicPeriodsDocument;
};

const normalizeDraft = (value: unknown): AcademicPeriodDraft => {
  if (!exact(value, ["name", "startsOn", "endsOn"]) || typeof value.name !== "string") fail("Заполните название и границы учебного периода.");
  const draft = { name: normalizeName(value.name), startsOn: value.startsOn, endsOn: value.endsOn };
  if (!validDraft(draft)) fail("Укажите название от 2 до 160 символов и корректные даты; окончание не должно быть раньше начала.");
  return draft;
};
export const executeAcademicPeriodCommand = (
  source: AcademicPeriodsDocument, command: AcademicPeriodCommand, actor: PortalAccount | undefined,
  metadata: { entityId: string; eventId: string; occurredAt: string },
): AcademicPeriodsDocument => {
  const state = decodeAcademicPeriodsDocument(JSON.stringify(source));
  const contextFields = ["type", "actorId", "actorRevision", "expectedRevision", "draft"];
  const extraFields = command?.type === "create-year" ? [] : command?.type === "create-term" ? ["yearId"] : command?.type === "update-year" ? ["yearId", "entityRevision"] : command?.type === "update-term" ? ["termId", "entityRevision"] : null;
  if (!extraFields || !exact(command, [...contextFields, ...extraFields]) || !identifier(command.actorId) || !integer(command.actorRevision, 1) || !integer(command.expectedRevision, 0)) fail("Не удалось прочитать действие с учебным периодом.");
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) fail("Управление учебными периодами доступно только активному настройщику.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision) fail("Справочник или учётная запись изменились. Обновите данные и повторите действие.");
  if (!exact(metadata, ["entityId", "eventId", "occurredAt"]) || !identifier(metadata.entityId) || !identifier(metadata.eventId) || !timestamp(metadata.occurredAt)) fail("Не удалось сформировать запись истории учебного периода.");
  const draft = normalizeDraft(command.draft), entity = command.type.endsWith("year") ? "year" : "term";
  const before = command.type === "update-year" ? state.years.find(row => row.id === command.yearId)
    : command.type === "update-term" ? state.terms.find(row => row.id === command.termId) : null;
  const updating = command.type === "update-year" || command.type === "update-term";
  if (updating && (!integer(command.entityRevision, 1) || !before || before.revision !== command.entityRevision || before.id !== metadata.entityId)) fail("Учебный период изменён или недоступен. Перечитайте его перед сохранением.");
  const yearId = command.type === "create-term" ? command.yearId : command.type === "update-term" ? (before as AcademicTerm).yearId : undefined;
  const after = { id: metadata.entityId, revision: (before?.revision ?? 0) + 1, ...draft, ...(entity === "term" ? { yearId } : {}) };
  if (updating && before && !changed(before, after)) fail("Сведения об учебном периоде не изменились.");
  const event = { id: metadata.eventId, actorId: actor.id, occurredAt: metadata.occurredAt, action: updating ? "updated" : "created", entity, before, after } as AcademicPeriodEvent;
  const next = { ...state, revision: state.revision + 1, years: entity === "year" ? [...state.years.filter(row => row.id !== after.id), after] : state.years,
    terms: entity === "term" ? [...state.terms.filter(row => row.id !== after.id), after] : state.terms, history: [...state.history, event] };
  return decodeAcademicPeriodsDocument(JSON.stringify(next));
};
