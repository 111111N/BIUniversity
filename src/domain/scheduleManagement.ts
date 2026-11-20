import { parseCalendarDate } from "./calendar";
import { getWeekStart, toLocalDateKey } from "./schedule";
import type { LessonType } from "./academic";
import { compareLessonRooms, indexRooms, type RoomIndex } from "./rooms";
export { getScheduleRoomKey } from "./roomKeys";

export interface ManagedLesson {
  id: string;
  scheduleId: number;
  subjectId: string;
  groupId: string;
  teacherId: string;
  teacherName: string;
  teachingAssignmentId?: string;
  teachingAssignmentRevision?: number;
  date: string;
  startsAt: string;
  endsAt: string;
  type: LessonType;
  room: string;
  roomId?: string;
  roomRevision?: number;
  roomBuilding?: string;
}
export interface ManagedScheduleWeek {
  weekStart: string;
  groupId: string;
  lessons: ManagedLesson[];
  updatedBy?: string;
  updatedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
}
export interface ManagedJournalEntry extends ManagedLesson { journalState: "active" | "cancelled" | "rescheduled" }
export interface SchedulePublicationVersion {
  id: string; number: number; origin: "saved-snapshot" | "published";
  actorId: string; occurredAt: string; week: ManagedScheduleWeek;
}
export interface ManagedScheduleSnapshot {
  version: 1 | 2;
  revision: number;
  drafts: ManagedScheduleWeek[];
  published: ManagedScheduleWeek[];
  journal: ManagedJournalEntry[];
  publications?: SchedulePublicationVersion[];
}
export interface ScheduleConflict { lessonId: string; otherId: string; kind: "teacher" | "group" | "room"; message: string }

export const MANAGED_SCHEDULE_KEY = "bi-university-managed-schedule-v1";
export const createEmptyManagedSchedule = (): ManagedScheduleSnapshot => ({ version: 1, revision: 0, drafts: [], published: [], journal: [] });
export const getManagedWeekKey = (date: string) => {
  const parsed = parseCalendarDate(date);
  return parsed ? toLocalDateKey(getWeekStart(parsed)) : "";
};
const timeIsValid = (time: string) => /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
export const getManagedLessonIssues = (lesson: ManagedLesson): { field: keyof ManagedLesson; message: string }[] => {
  const errors: { field: keyof ManagedLesson; message: string }[] = [];
  const date = parseCalendarDate(lesson.date);
  if (!date || date.getDay() === 0) errors.push({ field: "date", message: "Выберите дату с понедельника по субботу." });
  if (!timeIsValid(lesson.startsAt) || !timeIsValid(lesson.endsAt) || lesson.startsAt >= lesson.endsAt) errors.push({ field: !timeIsValid(lesson.startsAt) ? "startsAt" : "endsAt", message: "Время окончания должно быть позже начала в пределах одного дня." });
  if (!lesson.subjectId.trim() || !lesson.groupId.trim()) errors.push({ field: !lesson.subjectId.trim() ? "subjectId" : "groupId", message: "Выберите предмет и группу." });
  if (!lesson.teacherId.trim() || !lesson.teacherName.trim()) errors.push({ field: "teacherId", message: "Выберите преподавателя." });
  if (!lesson.room.trim() || lesson.room.length > (lesson.roomId ? 160 : 100)) errors.push({ field: "room", message: "Укажите корректное название аудитории." });
  if (!(lesson.roomId === undefined && lesson.roomRevision === undefined && lesson.roomBuilding === undefined || typeof lesson.roomId === "string" && lesson.roomId.trim().length > 0 && lesson.roomId.length <= 160 && Number.isSafeInteger(lesson.roomRevision) && Number(lesson.roomRevision) > 0 && typeof lesson.roomBuilding === "string" && lesson.roomBuilding.trim().length > 0 && lesson.roomBuilding.length <= 160)) errors.push({ field: "room", message: "Ссылка на аудиторию неполная. Выберите аудиторию заново." });
  if (!["lecture", "practice", "laboratory"].includes(lesson.type)) errors.push({ field: "type", message: "Выберите тип занятия." });
  if (!lesson.id.startsWith("managed:") || !Number.isSafeInteger(lesson.scheduleId) || lesson.scheduleId <= 0) errors.push({ field: "id", message: "Некорректный идентификатор занятия." });
  return errors;
};
export const validateManagedLesson = (lesson: ManagedLesson): string[] => getManagedLessonIssues(lesson).map((issue) => issue.message);
export const findScheduleConflicts = (lessons: ManagedLesson[], others: ManagedLesson[] = [], rooms: RoomIndex = indexRooms({ version: 1, revision: 0, rooms: [], history: [] })): ScheduleConflict[] => {
  const result: ScheduleConflict[] = [];
  const all = [...lessons, ...others];
  lessons.forEach((lesson, index) => {
    all.slice(index + 1).forEach((other) => {
      if (lesson.id === other.id || lesson.date !== other.date || lesson.startsAt >= other.endsAt || other.startsAt >= lesson.endsAt) return;
      const add = (kind: ScheduleConflict["kind"], message: string) => result.push({ lessonId: lesson.id, otherId: other.id, kind, message: `${lesson.date}, ${lesson.startsAt}: ${message}` });
      if (lesson.teacherId === other.teacherId) add("teacher", "преподаватель занят на другой паре.");
      if (lesson.groupId === other.groupId) add("group", "у группы уже есть занятие в это время.");
      const roomConflict = compareLessonRooms(lesson, other, rooms);
      if (roomConflict) add("room", roomConflict === "confirmed" ? "аудитория занята другой парой." : "возможно пересечение аудитории со старым названием. Уточните аудиторию и корпус обеих пар.");
    });
  });
  return result;
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isLesson = (value: unknown): value is ManagedLesson => isRecord(value)
  && ["id", "subjectId", "groupId", "teacherId", "teacherName", "date", "startsAt", "endsAt", "type", "room"].every((key) => typeof value[key] === "string")
  && typeof value.scheduleId === "number" && validateManagedLesson(value as unknown as ManagedLesson).length === 0
  && (value.teachingAssignmentId === undefined && value.teachingAssignmentRevision === undefined || typeof value.teachingAssignmentId === "string" && value.teachingAssignmentId.trim().length > 0 && value.teachingAssignmentId.length <= 160 && Number.isSafeInteger(value.teachingAssignmentRevision) && Number(value.teachingAssignmentRevision) > 0);
const isWeek = (value: unknown): value is ManagedScheduleWeek => isRecord(value) && typeof value.weekStart === "string" && getManagedWeekKey(value.weekStart) === value.weekStart
  && typeof value.groupId === "string" && Boolean(value.groupId.trim())
  && ["updatedBy", "publishedBy"].every((key) => value[key] === undefined || (typeof value[key] === "string" && Boolean(value[key].trim())))
  && ["updatedAt", "publishedAt"].every((key) => value[key] === undefined || (typeof value[key] === "string" && Number.isFinite(Date.parse(value[key]))))
  && Array.isArray(value.lessons) && value.lessons.every((lesson) => isLesson(lesson) && lesson.groupId === value.groupId && getManagedWeekKey(lesson.date) === value.weekStart);
export const decodeManagedSchedule = (raw: string): ManagedScheduleSnapshot | null => {
  try {
    if (raw.length > 32 * 1024 * 1024) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2) || !Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0
      || !Array.isArray(parsed.drafts) || !parsed.drafts.every(isWeek)
      || !Array.isArray(parsed.published) || !parsed.published.every(isWeek)
      || !Array.isArray(parsed.journal) || !parsed.journal.every((entry) => isLesson(entry) && isRecord(entry) && ["active", "cancelled", "rescheduled"].includes(String(entry.journalState)))) return null;
    if (parsed.version === 1 && parsed.publications !== undefined || parsed.version === 2 && !validPublicationArchive(parsed.publications, parsed.published as ManagedScheduleWeek[])) return null;
    for (const weeks of [parsed.drafts, parsed.published]) {
      if (new Set(weeks.map((week) => `${week.weekStart}:${week.groupId}`)).size !== weeks.length) return null;
      const lessons = weeks.flatMap((week) => week.lessons);
      if (new Set(lessons.map((lesson) => lesson.id)).size !== lessons.length || new Set(lessons.map((lesson) => lesson.scheduleId)).size !== lessons.length) return null;
    }
    const journal = parsed.journal as ManagedJournalEntry[];
    if (new Set(journal.map((lesson) => `${lesson.id}:${lesson.subjectId}:${lesson.groupId}`)).size !== journal.length) return null;
    const published = (parsed.published as ManagedScheduleWeek[]).flatMap((week) => week.lessons);
    const all = [...(parsed.drafts as ManagedScheduleWeek[]).flatMap((week) => week.lessons), ...published, ...journal, ...((parsed.publications ?? []) as SchedulePublicationVersion[]).flatMap(version => version.week.lessons)];
    const ids = new Map<string, number>();
    const scheduleIds = new Map<number, string>();
    for (const lesson of all) {
      if ((ids.has(lesson.id) && ids.get(lesson.id) !== lesson.scheduleId) || (scheduleIds.has(lesson.scheduleId) && scheduleIds.get(lesson.scheduleId) !== lesson.id)) return null;
      ids.set(lesson.id, lesson.scheduleId); scheduleIds.set(lesson.scheduleId, lesson.id);
    }
    const sameIdentity = (a: ManagedLesson, b: ManagedLesson) => a.id === b.id && a.subjectId === b.subjectId && a.groupId === b.groupId;
    if (published.some((lesson) => !journal.some((entry) => sameIdentity(lesson, entry) && entry.journalState === "active" && Object.keys(lesson).every((key) => lesson[key as keyof ManagedLesson] === entry[key as keyof ManagedLesson])))
      || journal.some((entry) => entry.journalState === "active" && !published.some((lesson) => sameIdentity(lesson, entry)))) return null;
    return parsed as unknown as ManagedScheduleSnapshot;
  } catch { return null; }
};
const sameSnapshot = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => sameSnapshot(entry, right[index]));
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameSnapshot(a[key], b[key]));
};
function validPublicationArchive(value: unknown, published: ManagedScheduleWeek[]): value is SchedulePublicationVersion[] {
  if (!Array.isArray(value) || value.length > 20000) return false;
  const ids = new Set<string>(), lastByWeek = new Map<string, SchedulePublicationVersion>();
  let previousTime = "", publicationStarted = false, baselineTime = "";
  for (const row of value) {
    if (!isRecord(row) || Object.keys(row).length !== 6 || !["id", "number", "origin", "actorId", "occurredAt", "week"].every(key => Object.hasOwn(row, key))) return false;
    if (typeof row.id !== "string" || !row.id.startsWith("publication:") || row.id.length > 160 || ids.has(row.id) || !Number.isSafeInteger(row.number) || Number(row.number) < 1
      || typeof row.actorId !== "string" || !row.actorId.trim() || row.actorId.length > 160 || typeof row.occurredAt !== "string" || !Number.isFinite(Date.parse(row.occurredAt)) || new Date(row.occurredAt).toISOString() !== row.occurredAt || row.occurredAt < previousTime
      || !["saved-snapshot", "published"].includes(String(row.origin)) || !isWeek(row.week)) return false;
    const key = JSON.stringify([row.week.groupId, row.week.weekStart]), previous = lastByWeek.get(key);
    if (row.number !== (previous?.number ?? 0) + 1) return false;
    if (row.origin === "saved-snapshot") {
      if (publicationStarted || previous || baselineTime && baselineTime !== row.occurredAt) return false;
      baselineTime = row.occurredAt;
    } else {
      publicationStarted = true;
      if (row.week.publishedBy !== row.actorId || row.week.publishedAt !== row.occurredAt) return false;
    }
    ids.add(row.id); previousTime = row.occurredAt; lastByWeek.set(key, row as unknown as SchedulePublicationVersion);
  }
  return publicationStarted && lastByWeek.size === published.length && published.every(week => sameSnapshot(week, lastByWeek.get(JSON.stringify([week.groupId, week.weekStart]))?.week));
}
export const archiveSchedulePublication = (snapshot: ManagedScheduleSnapshot, week: ManagedScheduleWeek, actorId: string, occurredAt: string, createId: () => string): Pick<ManagedScheduleSnapshot, "version" | "publications"> => {
  const publications = [...(snapshot.publications ?? [])];
  if (publications.length + (snapshot.version === 1 ? snapshot.published.length : 0) >= 20000) throw new Error("Достигнут предел локального архива публикаций. Новая публикация не сохранена; требуется перенос хранилища на сервер.");
  if (snapshot.version === 1) for (const previous of snapshot.published) publications.push({ id: createId(), number: 1, origin: "saved-snapshot", actorId, occurredAt, week: structuredClone(previous) });
  const previous = [...publications].reverse().find(row => row.week.groupId === week.groupId && row.week.weekStart === week.weekStart);
  publications.push({ id: createId(), number: (previous?.number ?? 0) + 1, origin: "published", actorId, occurredAt, week: structuredClone(week) });
  return { version: 2, publications };
};
export const snapshotHasFutureTeaching = (snapshot: ManagedScheduleSnapshot, teacherId: string, now = new Date()) => snapshot.published.some((week) => week.lessons.some((lesson) => lesson.teacherId === teacherId && new Date(`${lesson.date}T${lesson.endsAt}`).getTime() > now.getTime()));

export const reconcilePublishedJournal = (history: ManagedJournalEntry[], previous: ManagedLesson[], next: ManagedLesson[]): ManagedJournalEntry[] => {
  const identities = new Set(previous.map((lesson) => `${lesson.id}:${lesson.subjectId}:${lesson.groupId}`));
  const nextIdentities = new Set(next.map((lesson) => `${lesson.id}:${lesson.subjectId}:${lesson.groupId}`));
  const nextIds = new Set(next.map((lesson) => lesson.id));
  const archived = history.map((entry): ManagedJournalEntry => identities.has(`${entry.id}:${entry.subjectId}:${entry.groupId}`) && !nextIdentities.has(`${entry.id}:${entry.subjectId}:${entry.groupId}`)
    ? { ...entry, journalState: nextIds.has(entry.id) ? "rescheduled" : "cancelled" } : entry);
  const result = new Map(archived.map((entry) => [`${entry.id}:${entry.subjectId}:${entry.groupId}`, entry]));
  next.forEach((lesson) => result.set(`${lesson.id}:${lesson.subjectId}:${lesson.groupId}`, { ...lesson, journalState: "active" }));
  return [...result.values()];
};
