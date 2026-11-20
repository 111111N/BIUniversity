import { getScheduleRoomKey } from "./roomKeys";
export const ROOMS_KEY = "bi-university-rooms-v1";
export interface Room { id: string; revision: number; building: string; name: string; capacity: number | null; equipment: string[]; aliases: string[]; status: "active" | "archived" }
export interface RoomEvent { id: string; actorId: string; occurredAt: string; before: Room | null; after: Room }
export interface RoomsDocument { version: 1; revision: number; rooms: Room[]; history: RoomEvent[] }
export interface RoomDraft { building: string; name: string; capacity: number | null; equipment: string[]; aliases: string[] }
export interface RoomContext { actorId: string; actorRevision: number; expectedRevision: number; accountsRevision: number; scheduleRevision: number }
export type RoomCommand = RoomContext & ({ type: "save"; roomId?: string; roomRevision?: number; draft: RoomDraft } | { type: "archive" | "restore"; roomId: string; roomRevision: number });
export const emptyRooms = (): RoomsDocument => ({ version: 1, revision: 0, rooms: [], history: [] });
export const normalizeRoomText = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
export const roomLabel = (room: Pick<Room, "building" | "name">) => `${room.building} · ${room.name}`;
export const roomIdentityKey = (room: Pick<Room, "building" | "name">) => JSON.stringify([normalizeRoomText(room.building).toLocaleLowerCase("ru-RU"), getScheduleRoomKey(normalizeRoomText(room.name))]);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const text = (value: unknown, max = 160): value is string => typeof value === "string" && value.length > 0 && value.length <= max && value === normalizeRoomText(value) && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
function fail(): never { throw new Error("Справочник аудиторий или история их изменений повреждены. Исходные данные сохранены."); }
const validateRoom = (value: unknown): Room => {
  if (!exact(value, ["id", "revision", "building", "name", "capacity", "equipment", "aliases", "status"]) || ![value.id, value.building, value.name].every(entry => text(entry)) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || value.capacity !== null && (!Number.isSafeInteger(value.capacity) || Number(value.capacity) < 1 || Number(value.capacity) > 1000000) || !["active", "archived"].includes(String(value.status))) fail();
  for (const key of ["equipment", "aliases"] as const) if (!Array.isArray(value[key]) || value[key].length > 100 || !value[key].every(entry => text(entry)) || new Set(value[key].map(entry => entry.toLocaleLowerCase("ru-RU"))).size !== value[key].length) fail();
  const room = value as unknown as Room;
  if (!getScheduleRoomKey(room.name) || room.aliases.some(alias => !getScheduleRoomKey(alias))) fail();
  return room;
};
const same = (a: Room | null | undefined, b: Room | null | undefined) => !a || !b ? a === b : a.id === b.id && a.revision === b.revision && a.name === b.name && a.building === b.building && a.capacity === b.capacity && a.status === b.status && JSON.stringify(a.equipment) === JSON.stringify(b.equipment) && JSON.stringify(a.aliases) === JSON.stringify(b.aliases);
export const decodeRooms = (raw: string): RoomsDocument => {
  if (raw.length > 16 * 1024 * 1024) fail();
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "rooms", "history"]) || value.version !== 1 || !Array.isArray(value.rooms) || value.rooms.length > 10000 || !Array.isArray(value.history) || value.history.length > 20000 || value.revision !== value.history.length) fail();
  const replay = new Map<string, Room>(), identities = new Map<string, string>(), eventIds = new Set<string>();
  let previousTime = "";
  for (const event of value.history) {
    if (!exact(event, ["id", "actorId", "occurredAt", "before", "after"]) || !text(event.id) || !text(event.actorId) || eventIds.has(event.id) || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt)) || new Date(event.occurredAt).toISOString() !== event.occurredAt || event.occurredAt < previousTime) fail();
    const before = event.before === null ? null : validateRoom(event.before), after = validateRoom(event.after);
    if (!same(replay.get(after.id) ?? null, before) || after.revision !== (before?.revision ?? 0) + 1 || !before && after.status !== "active") fail();
    if (before && (same(before, { ...after, revision: before.revision }) || before.status !== after.status && !same({ ...before, revision: after.revision, status: after.status }, after))) fail();
    if (before?.status === "active") identities.delete(roomIdentityKey(before));
    if (after.status === "active") { const identity = roomIdentityKey(after); if (identities.has(identity) && identities.get(identity) !== after.id) fail(); identities.set(identity, after.id); }
    replay.set(after.id, after); eventIds.add(event.id); previousTime = event.occurredAt;
  }
  const rows = value.rooms.map(validateRoom);
  if (rows.length !== replay.size || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !same(row, replay.get(row.id)))) fail();
  return value as unknown as RoomsDocument;
};
export const appendRoom = (source: RoomsDocument, after: Room, metadata: { id: string; actorId: string; occurredAt: string }) => decodeRooms(JSON.stringify({ ...source, revision: source.revision + 1, rooms: [...source.rooms.filter(row => row.id !== after.id), after], history: [...source.history, { ...metadata, before: source.rooms.find(row => row.id === after.id) ?? null, after }] }));

export interface LessonRoom { room: string; roomId?: string; roomRevision?: number; roomBuilding?: string }
export interface RoomIndex { byId: Map<string, Room>; candidatesByLegacyKey: Map<string, Set<string>> }
/** Old labels remain candidates, not confirmed identities. Explicit room IDs resolve ambiguity. */
export const indexRooms = (document: RoomsDocument): RoomIndex => {
  const candidatesByLegacyKey = new Map<string, Set<string>>();
  const add = (room: Room) => { for (const label of [room.name, roomLabel(room), ...room.aliases]) { const key = getScheduleRoomKey(label); if (!key) continue; const ids = candidatesByLegacyKey.get(key) ?? new Set<string>(); ids.add(room.id); candidatesByLegacyKey.set(key, ids); } };
  document.history.forEach(event => { if (event.before) add(event.before); add(event.after); });
  return { byId: new Map(document.rooms.map(room => [room.id, room])), candidatesByLegacyKey };
};
export type RoomConflict = "confirmed" | "possible" | null;
export const compareLessonRooms = (a: LessonRoom, b: LessonRoom, index: RoomIndex): RoomConflict => {
  if (a.roomId && b.roomId) return a.roomId === b.roomId ? "confirmed" : null;
  const keyA = getScheduleRoomKey(a.room), keyB = getScheduleRoomKey(b.room);
  if (!a.roomId && !b.roomId && keyA && keyA === keyB) return "confirmed";
  const candidatesA = a.roomId ? new Set([a.roomId]) : index.candidatesByLegacyKey.get(keyA) ?? new Set<string>(), candidatesB = b.roomId ? new Set([b.roomId]) : index.candidatesByLegacyKey.get(keyB) ?? new Set<string>();
  if ([...candidatesA].some(id => candidatesB.has(id))) return "possible";
  if (keyA && keyA === keyB) return "possible";
  return null;
};
export const formatLessonRoom = (lesson: LessonRoom) => lesson.roomBuilding ? `${lesson.roomBuilding} · ${lesson.room}` : lesson.room;
export const lessonRoomFilterKey = (lesson: LessonRoom) => lesson.roomId ? `id:${lesson.roomId}` : getScheduleRoomKey(lesson.room);
export const roomLessonIssues = (lesson: LessonRoom, index: RoomIndex, allowLegacy: boolean): string[] => {
  if (!lesson.roomId) return allowLegacy ? [] : ["Выберите аудиторию из справочника для новой или скопированной пары."];
  const room = index.byId.get(lesson.roomId);
  if (!room || room.status !== "active") return ["Аудитория недоступна или находится в архиве. Выберите действующую аудиторию."];
  if (room.revision !== lesson.roomRevision || room.name !== lesson.room || room.building !== lesson.roomBuilding) return ["Аудитория изменилась. Выберите её актуальную карточку заново."];
  return [];
};
