import { isAccountActive, type PortalAccount } from "./accounts";
import { decodeAcademicPeriodsDocument, isAcademicCalendarDate, type AcademicPeriodsDocument } from "./academicPeriods";
import { resolveAssessmentAcademicPeriod, validateAssessmentAcademicPeriod } from "./assessmentPeriods";
import { academicDayKey, academicDayNumber, academicRangeDays, academicRangesOverlap, formatAcademicDay } from "./academicCalendarMath";
import { sameCurriculumData } from "./curricula";
import { CALENDAR_PHASES, type CalendarContents, type GroupCalendar, type GroupCalendarCommand, type GroupCalendarEvent, type GroupCalendarsDocument } from "./groupCalendarTypes";

function fail(message = "Учебные календари или история их изменений повреждены."): never { throw new Error(message); }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value: unknown, min = 1, max = 160): value is string => typeof value === "string" && value.length >= min && value.length <= max && value.trim() === value && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const validateCalendarContents = (contents: unknown, period: GroupCalendar["period"]): CalendarContents => {
  if (!exact(contents, ["segments", "daysOff"]) || !Array.isArray(contents.segments) || contents.segments.length > 500 || !Array.isArray(contents.daysOff) || contents.daysOff.length > 1000) fail("Проверьте интервалы и неучебные дни календаря.");
  const ids = new Set<string>(), dates = new Set<string>();
  let previousEnd = "";
  for (const segment of contents.segments) {
    if (!exact(segment, ["id", "kind", "startsOn", "endsOn"]) || !text(segment.id) || ids.has(segment.id) || typeof segment.kind !== "string" || !Object.hasOwn(CALENDAR_PHASES, segment.kind) || !isAcademicCalendarDate(segment.startsOn) || !isAcademicCalendarDate(segment.endsOn) || segment.startsOn > segment.endsOn || segment.startsOn < period.term.startsOn || segment.endsOn > period.term.endsOn || segment.startsOn <= previousEnd) fail("Интервалы должны идти по датам, не пересекаться и находиться внутри семестра.");
    ids.add(segment.id); previousEnd = segment.endsOn;
  }
  for (const day of contents.daysOff) {
    if (!exact(day, ["id", "date", "name"]) || !text(day.id) || ids.has(day.id) || !isAcademicCalendarDate(day.date) || dates.has(day.date) || day.date < period.term.startsOn || day.date > period.term.endsOn || !text(day.name, 2) || normalize(day.name) !== day.name) fail("Для неучебного дня укажите уникальную дату внутри семестра и название от 2 до 160 символов.");
    ids.add(day.id); dates.add(day.date);
  }
  return contents as unknown as CalendarContents;
};
const validateCalendar = (value: unknown): GroupCalendar => {
  if (!exact(value, ["id", "revision", "group", "period", "state", "segments", "daysOff"]) || !text(value.id) || !integer(value.revision, 1) || !exact(value.group, ["id", "name", "revision"]) || !text(value.group.id) || !text(value.group.name) || !integer(value.group.revision) || !["open", "closed"].includes(value.state as string)) fail();
  const period = validateAssessmentAcademicPeriod(value.period);
  if (academicRangeDays(period.term) > 3660) fail("Календарь семестра не может превышать десять лет.");
  validateCalendarContents({ segments: value.segments, daysOff: value.daysOff }, period);
  return value as unknown as GroupCalendar;
};
export const shiftedCalendarContents = (source: GroupCalendar, target: GroupCalendar["period"]): CalendarContents => {
  const offset = academicDayNumber(target.term.startsOn) - academicDayNumber(source.period.term.startsOn);
  const shift = (date: string) => academicDayKey(academicDayNumber(date) + offset);
  return validateCalendarContents({ segments: source.segments.map(row => ({ ...row, startsOn: shift(row.startsOn), endsOn: shift(row.endsOn) })), daysOff: source.daysOff.map(row => ({ ...row, date: shift(row.date) })) }, target);
};
export const decodeGroupCalendars = (raw: string): GroupCalendarsDocument => {
  if (typeof raw !== "string" || raw.length > 16 * 1024 * 1024) fail("Учебные календари превышают поддерживаемый размер.");
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "calendars", "history"]) || value.version !== 1 || !integer(value.revision) || !Array.isArray(value.calendars) || value.calendars.length > 10_000 || !Array.isArray(value.history) || value.history.length > 20_000 || value.revision !== value.history.length) fail();
  const records = new Map<string, GroupCalendar>(), identities = new Map<string, string>(), eventIds = new Set<string>();
  let previousTime = "";
  for (const event of value.history) {
    if (!exact(event, ["id", "actorId", "occurredAt", "action", "before", "after", "reason", "source"]) || !text(event.id) || eventIds.has(event.id) || !text(event.actorId) || !timestamp(event.occurredAt) || event.occurredAt < previousTime || !["saved", "copied", "closed", "reopened"].includes(event.action as string) || !text(event.reason, 0, 1000) || normalize(event.reason) !== event.reason) fail();
    const after = validateCalendar(event.after), before = event.before === null ? null : validateCalendar(event.before), current = records.get(after.id);
    const identity = JSON.stringify([after.group.id, after.period.term.id]);
    if (before === null ? current !== undefined || identities.has(identity) || after.revision !== 1 : !sameCurriculumData(before, current) || after.revision !== before.revision + 1 || after.group.id !== before.group.id || after.period.term.id !== before.period.term.id) fail();
    if (event.action === "saved" || event.action === "copied") {
      if (after.state !== "open" || before?.state === "closed" || before && sameCurriculumData({ ...before, revision: after.revision }, after) || event.reason !== "") fail();
    } else {
      if (!before || !sameCurriculumData(after, { ...before, revision: after.revision, state: event.action === "closed" ? "closed" : "open" }) || before.state !== (event.action === "closed" ? "open" : "closed") || event.action === "reopened" && event.reason.length < 5) fail();
    }
    if (event.action === "copied") {
      if (!exact(event.source, ["calendarId", "revision", "offsetDays"]) || !text(event.source.calendarId) || !integer(event.source.revision, 1) || !Number.isSafeInteger(event.source.offsetDays)) fail();
      const source = records.get(event.source.calendarId);
      if (!source || source.id === after.id || source.revision !== event.source.revision || event.source.offsetDays !== academicDayNumber(after.period.term.startsOn) - academicDayNumber(source.period.term.startsOn) || !sameCurriculumData({ segments: after.segments, daysOff: after.daysOff }, shiftedCalendarContents(source, after.period))) fail();
    } else if (event.source !== null) fail();
    records.set(after.id, after); identities.set(identity, after.id); eventIds.add(event.id); previousTime = event.occurredAt;
  }
  if (value.calendars.length !== records.size) fail();
  const ids = new Set<string>();
  for (const row of value.calendars) { const record = validateCalendar(row); if (ids.has(record.id) || !sameCurriculumData(record, records.get(record.id))) fail(); ids.add(record.id); }
  return value as unknown as GroupCalendarsDocument;
};
export interface GroupCalendarDependencies { groupsRevision: number; groups: GroupCalendar["group"][]; archivedGroupIds: string[]; periods: AcademicPeriodsDocument }
export const executeGroupCalendarCommand = (source: GroupCalendarsDocument, command: GroupCalendarCommand, actor: PortalAccount | undefined, dependencies: GroupCalendarDependencies, metadata: { id: string; eventId: string; occurredAt: string }): GroupCalendarsDocument => {
  const state = decodeGroupCalendars(JSON.stringify(source)), periods = decodeAcademicPeriodsDocument(JSON.stringify(dependencies.periods));
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) fail("Календарь и закрытие периода доступны только действующему настройщику.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision || dependencies.groupsRevision !== command.groupsRevision || periods.revision !== command.periodsRevision) fail("Календарь, справочники или права изменились. Ввод сохранён; обновите проверку.");
  if (!text(metadata.id) || !text(metadata.eventId) || !timestamp(metadata.occurredAt) || metadata.occurredAt < (state.history.at(-1)?.occurredAt ?? "") || metadata.occurredAt < (periods.history.at(-1)?.occurredAt ?? "")) fail("Не удалось подготовить ID или время изменения календаря.");
  const baseKeys = ["actorId", "actorRevision", "expectedRevision", "groupsRevision", "periodsRevision", "type", "calendarRevision"];
  let before: GroupCalendar | null, after: GroupCalendar, action: GroupCalendarEvent["action"], reason = "", copied: GroupCalendarEvent["source"] = null;
  if (command.type === "save" || command.type === "copy") {
    if (!exact(command, [...baseKeys, "groupId", "termId", ...(command.type === "save" ? ["contents"] : ["sourceId", "sourceRevision"])])) fail("Проверьте команду сохранения календаря.");
    const group = dependencies.groups.find(row => row.id === command.groupId);
    if (!group || dependencies.archivedGroupIds.includes(group.id)) fail("Выберите действующую группу.");
    before = state.calendars.find(row => row.group.id === group.id && row.period.term.id === command.termId) ?? null;
    if ((before?.revision ?? 0) !== command.calendarRevision) fail("Этот календарь изменился. Откройте актуальную карточку.");
    if (before?.state === "closed") fail("Период закрыт. Сначала переоткройте его с указанием причины.");
    const period = resolveAssessmentAcademicPeriod(periods, { termId: command.termId, expectedRevision: command.periodsRevision }, metadata.occurredAt);
    let contents: CalendarContents;
    if (command.type === "copy") {
      const original = state.calendars.find(row => row.id === command.sourceId);
      if (!original || original.revision !== command.sourceRevision || original.id === before?.id) fail("Источник копирования изменился или совпадает с назначением.");
      contents = shiftedCalendarContents(original, period); copied = { calendarId: original.id, revision: original.revision, offsetDays: academicDayNumber(period.term.startsOn) - academicDayNumber(original.period.term.startsOn) }; action = "copied";
    } else {
      if (!exact(command.contents, ["segments", "daysOff"]) || !Array.isArray(command.contents.segments) || !Array.isArray(command.contents.daysOff)) fail("Проверьте состав календаря.");
      contents = { segments: [...command.contents.segments].sort((a, b) => String(a.startsOn).localeCompare(String(b.startsOn))), daysOff: command.contents.daysOff.map(row => ({ ...row, name: typeof row.name === "string" ? normalize(row.name) : row.name })).sort((a, b) => String(a.date).localeCompare(String(b.date))) };
      validateCalendarContents(contents, period); action = "saved";
    }
    after = { id: before?.id ?? metadata.id, revision: (before?.revision ?? 0) + 1, group: structuredClone(group), period, state: "open", ...contents };
  } else {
    if (!exact(command, [...baseKeys, "calendarId", "reason"]) || !["close", "reopen"].includes(command.type) || typeof command.reason !== "string") fail("Проверьте действие с состоянием периода.");
    before = state.calendars.find(row => row.id === command.calendarId) ?? null;
    if (!before || before.revision !== command.calendarRevision) fail("Период изменился. Обновите карточку перед изменением состояния.");
    reason = normalize(command.reason);
    if (!text(reason, command.type === "reopen" ? 5 : 0, 1000)) fail("Для переоткрытия укажите причину от 5 до 1000 символов.");
    if (before.state !== (command.type === "close" ? "open" : "closed")) fail("Состояние периода уже изменилось. Перечитайте карточку.");
    if (command.type === "close") {
      const term = periods.terms.find(row => row.id === before!.period.term.id), year = periods.years.find(row => row.id === term?.yearId);
      if (!sameCurriculumData(term, before.period.term) || !sameCurriculumData(year, before.period.year)) fail("Реквизиты семестра изменились. Перед закрытием сохраните календарь с актуальными границами периода.");
    }
    after = { ...before, revision: before.revision + 1, state: command.type === "close" ? "closed" : "open" }; action = command.type === "close" ? "closed" : "reopened";
  }
  if (before && sameCurriculumData({ ...before, revision: after.revision }, after)) fail("Календарь не изменился.");
  return decodeGroupCalendars(JSON.stringify({ ...state, revision: state.revision + 1, calendars: [...state.calendars.filter(row => row.id !== after.id), after], history: [...state.history, { id: metadata.eventId, actorId: actor.id, occurredAt: metadata.occurredAt, action, before, after, reason, source: copied }] }));
};

export const calendarClosedMessage = (calendar: GroupCalendar) => `${calendar.group.name}: ${calendar.period.term.name} закрыт. Настройщик должен переоткрыть период с указанием причины.`;
export const assertCalendarDatesEditable = (document: GroupCalendarsDocument, groupId: string, dates: string[], termId?: string) => {
  const blocked = document.calendars.find(row => row.group.id === groupId && row.state === "closed" && (row.period.term.id === termId || dates.some(date => date >= row.period.term.startsOn && date <= row.period.term.endsOn)));
  if (blocked) fail(calendarClosedMessage(blocked));
};
export const getCalendarDayIssue = (calendar: GroupCalendar, date: string): string | null => {
  if (date < calendar.period.term.startsOn || date > calendar.period.term.endsOn) return null;
  if (calendar.state === "closed") return calendarClosedMessage(calendar);
  const day = calendar.daysOff.find(row => row.date === date);
  if (day) return `${formatAcademicDay(date)} — неучебный день: ${day.name}.`;
  if (calendar.segments.some(row => row.kind === "vacation" && date >= row.startsOn && date <= row.endsOn)) return `${formatAcademicDay(date)} — каникулы.`;
  return null;
};
export const getCalendarPublicationIssues = (document: GroupCalendarsDocument, groupId: string, dates: string[]): string[] => [...new Set(document.calendars.filter(row => row.group.id === groupId).flatMap(calendar => dates.map(date => getCalendarDayIssue(calendar, date)).filter((message): message is string => Boolean(message))))];
export const closedCalendarsInRange = (document: GroupCalendarsDocument, groupId: string, range: { startsOn: string; endsOn: string }) => document.calendars.filter(calendar => calendar.group.id === groupId && calendar.state === "closed" && academicRangesOverlap(calendar.period.term, range));
