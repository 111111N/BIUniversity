export const SCHEDULE_TEMPLATES_KEY = "bi-university-schedule-templates-v1";
export interface ScheduleTemplate { id: string; revision: number; name: string; publicationId: string; status: "active" | "archived" }
export interface ScheduleTemplateEvent { id: string; actorId: string; occurredAt: string; before: ScheduleTemplate | null; after: ScheduleTemplate }
export interface ScheduleTemplatesDocument { version: 1; revision: number; templates: ScheduleTemplate[]; history: ScheduleTemplateEvent[] }
export interface ScheduleTemplateContext { actorId: string; actorRevision: number; expectedRevision: number; accountsRevision: number; scheduleRevision: number }
export type ScheduleTemplateCommand = ScheduleTemplateContext & (
  | { type: "create"; name: string; publicationId: string }
  | { type: "rename"; name: string; templateId: string; templateRevision: number }
  | { type: "archive" | "restore"; templateId: string; templateRevision: number }
);
export const emptyScheduleTemplates = (): ScheduleTemplatesDocument => ({ version: 1, revision: 0, templates: [], history: [] });
export const normalizeTemplateName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const templateNameKey = (value: string) => normalizeTemplateName(value).toLocaleLowerCase("ru-RU");
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
function fail(): never { throw new Error("Шаблоны расписания или история их изменений повреждены. Исходные данные сохранены."); }
const record = (value: unknown): ScheduleTemplate => {
  if (!exact(value, ["id", "revision", "name", "publicationId", "status"]) || ![value.id, value.name, value.publicationId].every(text) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !["active", "archived"].includes(String(value.status))) fail();
  const row = value as unknown as ScheduleTemplate;
  if (row.name.length < 2 || normalizeTemplateName(row.name) !== row.name || !row.publicationId.startsWith("publication:")) fail();
  return row;
};
const same = (a: ScheduleTemplate | null | undefined, b: ScheduleTemplate | null | undefined) => !a || !b ? a === b : a.id === b.id && a.revision === b.revision && a.name === b.name && a.publicationId === b.publicationId && a.status === b.status;
export const decodeScheduleTemplates = (raw: string): ScheduleTemplatesDocument => {
  if (raw.length > 8 * 1024 * 1024) fail();
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "templates", "history"]) || value.version !== 1 || !Array.isArray(value.templates) || value.templates.length > 5000 || !Array.isArray(value.history) || value.history.length > 20000 || value.revision !== value.history.length) fail();
  const replay = new Map<string, ScheduleTemplate>(), names = new Map<string, string>(), eventIds = new Set<string>();
  let previousTime = "";
  for (const event of value.history) {
    if (!exact(event, ["id", "actorId", "occurredAt", "before", "after"]) || !text(event.id) || !text(event.actorId) || eventIds.has(event.id) || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt)) || new Date(event.occurredAt).toISOString() !== event.occurredAt || event.occurredAt < previousTime) fail();
    const before = event.before === null ? null : record(event.before), after = record(event.after);
    if (!same(replay.get(after.id) ?? null, before) || after.revision !== (before?.revision ?? 0) + 1 || !before && after.status !== "active" || before && (before.publicationId !== after.publicationId || before.name === after.name && before.status === after.status || before.name !== after.name && before.status !== after.status)) fail();
    if (before?.status === "active") names.delete(templateNameKey(before.name));
    if (after.status === "active") {
      const name = templateNameKey(after.name);
      if (names.has(name) && names.get(name) !== after.id) fail();
      names.set(name, after.id);
    }
    eventIds.add(event.id); previousTime = event.occurredAt; replay.set(after.id, after);
  }
  const rows = value.templates.map(record);
  if (rows.length !== replay.size || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !same(row, replay.get(row.id)))) fail();
  return value as unknown as ScheduleTemplatesDocument;
};
export const appendScheduleTemplate = (source: ScheduleTemplatesDocument, after: ScheduleTemplate, metadata: { id: string; actorId: string; occurredAt: string }) => decodeScheduleTemplates(JSON.stringify({ ...source, revision: source.revision + 1, templates: [...source.templates.filter(row => row.id !== after.id), after], history: [...source.history, { ...metadata, before: source.templates.find(row => row.id === after.id) ?? null, after }] }));
