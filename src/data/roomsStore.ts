import { appendRoom, indexRooms, normalizeRoomText, roomIdentityKey, roomLabel, ROOMS_KEY, type Room, type RoomCommand, type RoomContext } from "../domain/rooms";
import { getScheduleRoomKey } from "../domain/roomKeys";
import { isAccountActive } from "../domain/accounts";
import { readAccountsState, subscribeAccounts } from "./accountStore";
import { executeAdministrationWrite } from "./administrationWrite";
import { readManagedScheduleState, subscribeManagedSchedule } from "./managedScheduleStore";
import { readRoomsDocument, ROOMS_CHANGE_EVENT, subscribeRooms } from "./roomsRead";

const sources = (actorId: string) => {
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find(row => row.id === actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Справочник аудиторий доступен действующему настройщику.");
  const schedule = readManagedScheduleState();
  if (schedule.error) throw new Error(schedule.error);
  const state = readRoomsDocument();
  const context: RoomContext = { actorId, actorRevision: actor.revision, accountsRevision: accounts.revision, expectedRevision: state.revision, scheduleRevision: schedule.snapshot.revision };
  return { accounts, state, context, schedule: schedule.snapshot };
};
const checkContext = (expected: RoomContext, actual: RoomContext) => {
  if ((Object.keys(actual) as Array<keyof RoomContext>).some(key => expected[key] !== actual[key])) throw new Error("Аудитории, расписание или доступ изменились. Перепроверьте форму; ввод сохранён.");
};
export const roomsService = {
  async read(actorId: string) {
    try { const source = sources(actorId); return { context: source.context, rooms: source.state.rooms }; }
    catch (error) { console.error("Не удалось прочитать справочник аудиторий:", error); throw error; }
  },
  async execute(command: RoomCommand) {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const source = sources(captured.actorId); checkContext(captured, source.context);
        const before = source.state.rooms.find(row => row.id === captured.roomId);
        if (captured.roomId && (!before || before.revision !== captured.roomRevision)) throw new Error("Карточка аудитории изменилась. Откройте актуальную версию; ввод сохранён.");
        let after: Room;
        if (captured.type === "save") {
          if (before?.status === "archived") throw new Error("Сначала восстановите аудиторию из архива.");
          const draft = captured.draft;
          if (!draft || typeof draft.name !== "string" || typeof draft.building !== "string" || !Array.isArray(draft.equipment) || !Array.isArray(draft.aliases) || [...draft.equipment, ...draft.aliases].some(value => typeof value !== "string")) throw new Error("Проверьте поля аудитории и список оснащения.");
          after = { id: before?.id ?? crypto.randomUUID(), revision: (before?.revision ?? 0) + 1, building: normalizeRoomText(draft.building), name: normalizeRoomText(draft.name), capacity: draft.capacity, equipment: draft.equipment.map(normalizeRoomText), aliases: draft.aliases.map(normalizeRoomText), status: "active" };
          if (![after.name, after.building].every(value => value.length > 0 && value.length <= 160) || !getScheduleRoomKey(after.name)) throw new Error("Укажите корпус и название аудитории, не более 160 символов каждое.");
          if (after.capacity !== null && (!Number.isSafeInteger(after.capacity) || after.capacity < 1 || after.capacity > 1000000)) throw new Error("Количество мест должно быть целым числом от 1 до 1000000 или оставаться незаполненным.");
          for (const list of [after.equipment, after.aliases]) if (list.length > 100 || list.some(value => !value || value.length > 160) || new Set(list.map(value => value.toLocaleLowerCase("ru-RU"))).size !== list.length) throw new Error("Укажите не более 100 разных пунктов в каждом списке, до 160 символов на пункт.");
          if (before && JSON.stringify({ ...before, revision: after.revision }) === JSON.stringify(after)) throw new Error("Карточка аудитории не изменилась.");
        } else {
          if (!before || !["archive", "restore"].includes(captured.type)) throw new Error("Выберите корректную аудиторию и действие.");
          const status = captured.type === "archive" ? "archived" : "active";
          if (before.status === status) throw new Error("Состояние аудитории уже изменилось. Обновите список.");
          if (status === "archived") {
            const index = indexRooms(source.state), now = Date.now();
            const needed = [...source.schedule.drafts.flatMap(week => week.lessons), ...source.schedule.published.flatMap(week => week.lessons).filter(lesson => Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) > now)]
              .some(lesson => lesson.roomId ? lesson.roomId === before.id : index.candidatesByLegacyKey.get(getScheduleRoomKey(lesson.room))?.has(before.id));
            if (needed) throw new Error("Аудитория нужна сохранённому черновику или будущей опубликованной паре, в том числе со старым названием. Сначала уточните аудитории этих пар и опубликуйте изменения.");
          }
          after = { ...before, revision: before.revision + 1, status };
        }
        if (after.status === "active" && source.state.rooms.some(room => room.id !== after.id && room.status === "active" && roomIdentityKey(room) === roomIdentityKey(after))) throw new Error("Действующая аудитория с таким названием уже есть в этом корпусе. Используйте её карточку или уточните название.");
        const occurredAt = new Date().toISOString();
        if (source.state.history.at(-1)?.occurredAt && occurredAt < source.state.history.at(-1)!.occurredAt) throw new Error("Часы устройства отстают от последнего изменения. Исправьте время и повторите сохранение.");
        const next = appendRoom(source.state, after, { id: crypto.randomUUID(), actorId: captured.actorId, occurredAt });
        localStorage.setItem(ROOMS_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(ROOMS_CHANGE_EVENT));
      } catch (error) { console.error("Не удалось изменить аудиторию. Исходные данные сохранены:", error); if (error instanceof DOMException && error.name === "QuotaExceededError") throw new Error("Недостаточно места для справочника аудиторий. Изменения не сохранены."); throw error; }
    });
  },
  async history(context: RoomContext, roomId: string, page: number) {
    try {
      const source = sources(context.actorId); checkContext(context, source.context);
      if (!source.state.rooms.some(row => row.id === roomId)) throw new Error("Аудитория недоступна.");
      const events = source.state.history.filter(row => row.after.id === roomId).reverse(), pages = Math.max(1, Math.ceil(events.length / 20));
      if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error("Выберите корректную страницу истории.");
      const names = new Map(source.accounts.accounts.map(row => [row.id, row.name]));
      return { items: events.slice((page - 1) * 20, page * 20).map(event => ({ ...event, actorName: names.get(event.actorId) ?? "Учётная запись недоступна", label: roomLabel(event.after) })), page, pages, total: events.length };
    } catch (error) { console.error("Не удалось прочитать историю аудитории:", error); throw error; }
  },
  subscribe(listener: () => void) {
    const stops = [subscribeRooms(listener), subscribeAccounts(listener), subscribeManagedSchedule(listener)];
    return () => stops.forEach(stop => stop());
  },
};
export type RoomsSnapshot = Awaited<ReturnType<typeof roomsService.read>>;
