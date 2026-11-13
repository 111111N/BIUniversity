import { decodeAcademicPeriodsDocument, isAcademicCalendarDate, type AcademicPeriodsDocument } from "./academicPeriods";
import type { AssessmentAcademicPeriod, AssessmentPeriodSelection } from "./assessmentTypes";

function fail(message = "Связь аттестации с учебным периодом повреждена."): never { throw new Error(message); }
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const text = (value: unknown, max = 160): value is string => typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const yearKeys = ["id", "revision", "name", "startsOn", "endsOn"];
export const assessmentPeriodLabel = (value: AssessmentAcademicPeriod) => `${value.year.name} · ${value.term.name}`;
export const validateAssessmentAcademicPeriod = (value: unknown): AssessmentAcademicPeriod => {
  if (!exact(value, ["catalogRevision", "year", "term"]) || !positive(value.catalogRevision)) fail();
  for (const [entity, fields] of [[value.year, yearKeys], [value.term, [...yearKeys, "yearId"]]] as const) {
    if (!exact(entity, fields) || !text(entity.id) || !positive(entity.revision) || !text(entity.name) || entity.name.length < 2
      || entity.name.normalize("NFKC").replace(/\s+/g, " ") !== entity.name || !isAcademicCalendarDate(entity.startsOn) || !isAcademicCalendarDate(entity.endsOn) || entity.startsOn > entity.endsOn) fail();
  }
  const snapshot = value as unknown as AssessmentAcademicPeriod;
  if (snapshot.year.id === snapshot.term.id || snapshot.term.yearId !== snapshot.year.id || snapshot.term.startsOn < snapshot.year.startsOn || snapshot.term.endsOn > snapshot.year.endsOn
    || snapshot.year.revision + snapshot.term.revision > snapshot.catalogRevision) fail();
  return snapshot;
};
const recordKey = (row: AssessmentAcademicPeriod["year"] | AssessmentAcademicPeriod["term"]) => JSON.stringify([row.id, row.revision, row.name, row.startsOn, row.endsOn, "yearId" in row ? row.yearId : null]);
export const sameAssessmentAcademicPeriod = (left: AssessmentAcademicPeriod | undefined, right: AssessmentAcademicPeriod | undefined): boolean => !left || !right ? left === right
  : left.catalogRevision === right.catalogRevision && recordKey(left.year) === recordKey(right.year) && recordKey(left.term) === recordKey(right.term);

export const resolveAssessmentAcademicPeriod = (catalog: AcademicPeriodsDocument, selection: AssessmentPeriodSelection | undefined, occurredAt: string): AssessmentAcademicPeriod => {
  catalog = decodeAcademicPeriodsDocument(JSON.stringify(catalog));
  if (!exact(selection, ["termId", "expectedRevision"]) || !text(selection.termId) || !Number.isSafeInteger(selection.expectedRevision)) fail("Выберите учебный год и семестр из справочника.");
  if (selection.expectedRevision !== catalog.revision) fail("Учебные периоды изменились. Обновите проверку; введённые данные сохранены.");
  const term = catalog.terms.find(row => row.id === selection.termId), year = catalog.years.find(row => row.id === term?.yearId);
  if (!term || !year) fail("Выбранный семестр или учебный год недоступен. Перечитайте справочник.");
  if (Date.parse(catalog.history.at(-1)?.occurredAt ?? occurredAt) > Date.parse(occurredAt)) fail("Создание аттестации не может предшествовать сохранению учебного периода.");
  return structuredClone(validateAssessmentAcademicPeriod({ catalogRevision: catalog.revision, year, term }));
};

/** Index once, then locate each snapshot by the explicit document revision, never by today's name. */
export const createAssessmentPeriodHistoryLookup = (catalog: AcademicPeriodsDocument) => {
  type Version = { revision: number; value: AssessmentAcademicPeriod["year"] | AssessmentAcademicPeriod["term"] };
  const years = new Map<string, Version[]>(), terms = new Map<string, Version[]>();
  catalog.history.forEach((event, index) => {
    const map = event.entity === "year" ? years : terms, rows = map.get(event.after.id) ?? [];
    rows.push({ revision: index + 1, value: event.after }); map.set(event.after.id, rows);
  });
  const at = (rows: Version[] = [], revision: number) => {
    let low = 0, high = rows.length;
    while (low < high) { const middle = (low + high) >>> 1; if (rows[middle].revision <= revision) low = middle + 1; else high = middle; }
    return rows[low - 1]?.value;
  };
  return (snapshot: AssessmentAcademicPeriod, createdAt: string): boolean => {
    if (snapshot.catalogRevision > catalog.revision || Date.parse(catalog.history[snapshot.catalogRevision - 1]?.occurredAt ?? "") > Date.parse(createdAt)) return false;
    const year = at(years.get(snapshot.year.id), snapshot.catalogRevision), term = at(terms.get(snapshot.term.id), snapshot.catalogRevision);
    return Boolean(year && term && recordKey(year) === recordKey(snapshot.year) && recordKey(term) === recordKey(snapshot.term));
  };
};
export const assessmentPeriodExistsInHistory = (snapshot: AssessmentAcademicPeriod, catalog: AcademicPeriodsDocument, createdAt: string): boolean => createAssessmentPeriodHistoryLookup(catalog)(snapshot, createdAt);
