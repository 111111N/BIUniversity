import { decodeGroupCalendars } from "../domain/groupCalendars";
import { GROUP_CALENDARS_KEY, emptyGroupCalendars } from "../domain/groupCalendarTypes";

export const GROUP_CALENDARS_CHANGE_EVENT = "bi-university-group-calendars-change";
export const readGroupCalendarsDocument = () => {
  const raw = localStorage.getItem(GROUP_CALENDARS_KEY);
  return raw === null ? emptyGroupCalendars() : decodeGroupCalendars(raw);
};
export const subscribeGroupCalendars = (listener: () => void) => {
  const onStorage = (event: StorageEvent) => { if (event.key === GROUP_CALENDARS_KEY || event.key === null) listener(); };
  window.addEventListener(GROUP_CALENDARS_CHANGE_EVENT, listener); window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(GROUP_CALENDARS_CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
};
