import { decodeRooms, ROOMS_KEY } from "./rooms";
import { decodeScheduleTemplates, SCHEDULE_TEMPLATES_KEY } from "./scheduleTemplates";
import { decodeManagedSchedule, MANAGED_SCHEDULE_KEY } from "./scheduleManagement";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordEntries } from "./backupRecordComparison";

export const SCHEDULE_CATALOG_COMPARISON_LABELS = { revision: "Ревизия", name: "Название", building: "Корпус", capacity: "Количество мест", equipment: "Оснащение", aliases: "Прежние названия", status: "Состояние", actorId: "ID автора", occurredAt: "Дата события", before: "Прежний снимок", after: "Новый снимок", publicationId: "ID исходной публикации", number: "Номер версии", origin: "Происхождение снимка", week: "Снимок недели", roomId: "ID аудитории", roomRevision: "Версия аудитории", roomBuilding: "Корпус аудитории", teachingAssignmentId: "ID назначения преподавателя", teachingAssignmentRevision: "Версия назначения преподавателя", other: "Дополнительные поля" };
export type ScheduleCatalogComparedField = keyof typeof SCHEDULE_CATALOG_COMPARISON_LABELS;
export const SCHEDULE_CATALOG_SECTIONS = ["rooms", "roomHistory", "templates", "templateHistory", "publications"] as const;
export type ScheduleCatalogSection = typeof SCHEDULE_CATALOG_SECTIONS[number];
export type BackupScheduleCatalogComparison = { comparisonVersion: 1 } & Record<ScheduleCatalogSection, BackupRecordComparison<ScheduleCatalogComparedField>>;

const definition = (section: ScheduleCatalogSection, readers = { rooms: decodeRooms, templates: decodeScheduleTemplates, schedule: (raw: string) => { const value = decodeManagedSchedule(raw); if (!value) throw new Error("Повреждён документ расписания или архив публикаций."); return value; } }): BackupRecordDefinition<ScheduleCatalogComparedField> => {
  const base = (key: string, prefix: string) => ({ matchesKey: (candidate: string) => candidate.startsWith(prefix), supportsKey: (candidate: string) => candidate === key });
  if (section === "rooms") return { ...base(ROOMS_KEY, "bi-university-rooms-"), collection: "rooms", label: "Аудитории", fields: ["revision", "name", "building", "capacity", "equipment", "aliases", "status"], decode: raw => readers.rooms(raw).rooms };
  if (section === "roomHistory") return { ...base(ROOMS_KEY, "bi-university-rooms-"), collection: "room-history", label: "История аудиторий", fields: ["actorId", "occurredAt", "before", "after"], decode: raw => readers.rooms(raw).history };
  if (section === "templates") return { ...base(SCHEDULE_TEMPLATES_KEY, "bi-university-schedule-templates-"), collection: "schedule-templates", label: "Шаблоны расписания", fields: ["revision", "name", "publicationId", "status"], decode: raw => readers.templates(raw).templates };
  if (section === "templateHistory") return { ...base(SCHEDULE_TEMPLATES_KEY, "bi-university-schedule-templates-"), collection: "schedule-template-history", label: "История шаблонов", fields: ["actorId", "occurredAt", "before", "after"], decode: raw => readers.templates(raw).history };
  return { ...base(MANAGED_SCHEDULE_KEY, "bi-university-managed-schedule-"), collection: "schedule-publications", label: "Архив публикаций", fields: ["number", "origin", "actorId", "occurredAt", "week"], decode: raw => readers.schedule(raw).publications ?? [] };
};
const definitions = SCHEDULE_CATALOG_SECTIONS.map(section => ({ section, definition: definition(section) }));
const cached = <T,>(decode: (raw: string) => T) => {
  const values = new Map<string, T | null>();
  return (raw: string) => { if (!values.has(raw)) { try { values.set(raw, decode(raw)); } catch { values.set(raw, null); } } const value = values.get(raw); if (!value) throw new Error("Полная схема документа и его истории не читается."); return value; };
};
export async function compareBackupScheduleCatalogRecords(archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupScheduleCatalogComparison> {
  const readers = { rooms: cached(decodeRooms), templates: cached(decodeScheduleTemplates), schedule: cached((raw: string) => { const value = decodeManagedSchedule(raw); if (!value) throw new Error("Документ расписания повреждён."); return value; }) };
  const result = { comparisonVersion: 1 } as BackupScheduleCatalogComparison;
  for (const section of SCHEDULE_CATALOG_SECTIONS) result[section] = await compareBackupRecords(archive, browser, definition(section, readers), signal);
  return result;
}
export function assertCompleteScheduleCatalogComparison(review: BackupScheduleCatalogComparison) {
  if (review.comparisonVersion !== 1) throw new Error("Сравнение аудиторий, шаблонов и архива публикаций несовместимо. Проверьте резервную копию заново.");
  for (const item of definitions) assertCompleteBackupRecordComparison(review[item.section], item.definition);
}
export const getUncheckedScheduleCatalogDocuments = (review: BackupScheduleCatalogComparison) => new Set(SCHEDULE_CATALOG_SECTIONS.flatMap(section => review[section].uncompared.map(item => item.key))).size;
export const getScheduleCatalogBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => definitions.find(item => item.definition.collection === collection)?.definition;
