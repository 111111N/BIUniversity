import { ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument } from "./academicPeriods";
import { decodeEducationDirectories, EDUCATION_DIRECTORIES_KEY } from "./educationDirectories";
import { decodeCurricula } from "./curricula";
import { CURRICULA_KEY } from "./curriculumTypes";
import { decodeGroupCalendars } from "./groupCalendars";
import { GROUP_CALENDARS_KEY } from "./groupCalendarTypes";
import { decodeTeachingAssignments, TEACHING_ASSIGNMENTS_KEY } from "./teachingAssignments";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

export const ACADEMIC_COMPARISON_LABELS = { revision: "Ревизия", name: "Название", startsOn: "Начало периода", endsOn: "Окончание периода", yearId: "ID учебного года", code: "Код программы", entity: "Вид записи", actorId: "ID автора", occurredAt: "Дата события", action: "Действие", before: "Прежний снимок", after: "Новый снимок", familyId: "ID семейства планов", number: "Номер версии", sourceId: "ID исходной версии", state: "Состояние", program: "Снимок программы", form: "Снимок формы обучения", academicHourMinutes: "Продолжительность академического часа", hoursPerCredit: "Часов в зачётной единице", entries: "Строки плана и часы", group: "Снимок группы", planId: "ID версии плана", periods: "Семестры и типы занятий", period: "Снимок семестра", segments: "Интервалы календаря", daysOff: "Неучебные даты", reason: "Причина", source: "Источник копирования", teacherId: "ID преподавателя", subjectId: "ID дисциплины", groupId: "ID группы", mode: "Режим назначения", other: "Дополнительные поля" };
export type AcademicComparedField = keyof typeof ACADEMIC_COMPARISON_LABELS;
export const ACADEMIC_COMPARISON_SECTIONS = ["years", "terms", "periodHistory", "programs", "forms", "directoryHistory", "plans", "bindings", "curriculumHistory", "calendars", "calendarHistory", "teaching", "teachingHistory"] as const;
export type AcademicComparisonSection = typeof ACADEMIC_COMPARISON_SECTIONS[number];
export type BackupAcademicComparison = { comparisonVersion: 1 } & Record<AcademicComparisonSection, BackupRecordComparison<AcademicComparedField>>;

const readers = () => ({ periods: decodeAcademicPeriodsDocument, directories: decodeEducationDirectories, curricula: decodeCurricula, calendars: decodeGroupCalendars, teaching: decodeTeachingAssignments });
const historyFields = ["actorId", "occurredAt", "before", "after"] as const;
const definition = (section: AcademicComparisonSection, read = readers()): BackupRecordDefinition<AcademicComparedField> => {
  const base = (key: string) => ({ matchesKey: (candidate: string) => candidate.startsWith(key.slice(0, -2)), supportsKey: (candidate: string) => candidate === key });
  if (section === "years") return { ...base(ACADEMIC_PERIODS_STORAGE_KEY), collection: "academic-years", label: "Учебные годы", fields: ["revision", "name", "startsOn", "endsOn"], decode: raw => read.periods(raw).years };
  if (section === "terms") return { ...base(ACADEMIC_PERIODS_STORAGE_KEY), collection: "academic-terms", label: "Семестры", fields: ["revision", "name", "startsOn", "endsOn", "yearId"], decode: raw => read.periods(raw).terms };
  if (section === "periodHistory") return { ...base(ACADEMIC_PERIODS_STORAGE_KEY), collection: "academic-period-history", label: "История учебных периодов", fields: [...historyFields, "entity", "action"], decode: raw => read.periods(raw).history };
  if (section === "programs") return { ...base(EDUCATION_DIRECTORIES_KEY), collection: "education-programs", label: "Учебные программы", fields: ["revision", "name", "code"], decode: raw => read.directories(raw).programs };
  if (section === "forms") return { ...base(EDUCATION_DIRECTORIES_KEY), collection: "study-forms", label: "Формы обучения", fields: ["revision", "name"], decode: raw => read.directories(raw).forms };
  if (section === "directoryHistory") return { ...base(EDUCATION_DIRECTORIES_KEY), collection: "education-directory-history", label: "История программ и форм обучения", fields: [...historyFields, "entity"], decode: raw => read.directories(raw).history };
  if (section === "plans") return { ...base(CURRICULA_KEY), collection: "curriculum-plans", label: "Версии учебных планов", fields: ["revision", "name", "familyId", "number", "sourceId", "state", "program", "form", "academicHourMinutes", "hoursPerCredit", "entries"], decode: raw => read.curricula(raw).plans };
  if (section === "bindings") return { ...base(CURRICULA_KEY), collection: "group-curricula", label: "Назначения планов по ID группы", fields: ["revision", "group", "planId", "periods"], decode: raw => read.curricula(raw).bindings.map(binding => ({ id: binding.group.id, ...binding })) };
  if (section === "curriculumHistory") return { ...base(CURRICULA_KEY), collection: "curriculum-history", label: "История планов и назначений", fields: [...historyFields, "entity"], decode: raw => read.curricula(raw).history };
  if (section === "calendars") return { ...base(GROUP_CALENDARS_KEY), collection: "group-calendars", label: "Календари групп", fields: ["revision", "group", "period", "state", "segments", "daysOff"], decode: raw => read.calendars(raw).calendars };
  if (section === "calendarHistory") return { ...base(GROUP_CALENDARS_KEY), collection: "group-calendar-history", label: "История календарей групп", fields: [...historyFields, "action", "reason", "source"], decode: raw => read.calendars(raw).history };
  if (section === "teaching") return { ...base(TEACHING_ASSIGNMENTS_KEY), collection: "teaching-assignments", label: "Назначения по типам занятий", fields: ["revision", "teacherId", "subjectId", "groupId", "mode", "periods"], decode: raw => read.teaching(raw).assignments };
  return { ...base(TEACHING_ASSIGNMENTS_KEY), collection: "teaching-assignment-history", label: "История назначений по типам", fields: historyFields, decode: raw => read.teaching(raw).history };
};
const definitions = ACADEMIC_COMPARISON_SECTIONS.map(section => ({ section, definition: definition(section) }));
const cached = <T,>(decode: (raw: string) => T) => {
  const cache = new Map<string, T | null>();
  return (raw: string) => { if (!cache.has(raw)) { try { cache.set(raw, decode(raw)); } catch { cache.set(raw, null); } } const value = cache.get(raw); if (!value) throw new Error("Полная схема учебного документа и его истории не читается."); return value; };
};
export async function compareBackupAcademicRecords(archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupAcademicComparison> {
  const source = readers(), read = { periods: cached(source.periods), directories: cached(source.directories), curricula: cached(source.curricula), calendars: cached(source.calendars), teaching: cached(source.teaching) }, result = { comparisonVersion: 1 } as BackupAcademicComparison;
  for (const section of ACADEMIC_COMPARISON_SECTIONS) result[section] = await compareBackupRecords(archive, browser, definition(section, read), signal);
  return result;
}
export function assertCompleteAcademicComparison(review: BackupAcademicComparison) {
  if (review.comparisonVersion !== 1) throw new Error("Сравнение учебных справочников несовместимо. Проверьте резервную копию заново.");
  for (const item of definitions) assertCompleteBackupRecordComparison(review[item.section], item.definition);
}
export const getUncheckedAcademicDocuments = (review: BackupAcademicComparison) => new Set(ACADEMIC_COMPARISON_SECTIONS.flatMap(section => review[section].uncompared.map(item => item.key))).size;
export const getAcademicBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => definitions.find(item => item.definition.collection === collection)?.definition;
