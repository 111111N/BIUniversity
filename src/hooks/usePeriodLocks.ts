import { useCallback, useMemo, useSyncExternalStore } from "react";
import { subscribeGroupCalendars } from "../data/groupCalendarRead";
import { GROUP_CALENDARS_KEY, emptyGroupCalendars } from "../domain/groupCalendarTypes";
import { calendarClosedMessage, decodeGroupCalendars } from "../domain/groupCalendars";

export default function usePeriodLocks(groupId: string, records: Array<{ id: string; date: string }>, termId?: string) {
  const getSnapshot = useCallback(() => { try { return localStorage.getItem(GROUP_CALENDARS_KEY); } catch { return "unavailable"; } }, []);
  const raw = useSyncExternalStore(subscribeGroupCalendars, getSnapshot);
  const source = useMemo(() => {
    try { return { document: raw === null ? emptyGroupCalendars() : decodeGroupCalendars(raw), error: "" }; }
    catch (error) { console.error("Не удалось проверить закрытые учебные периоды:", error); return { document: emptyGroupCalendars(), error: "Учебный календарь недоступен. Изменения приостановлены; сохранённые данные доступны для чтения." }; }
  }, [raw]);
  const closed = source.document.calendars.filter(row => row.group.id === groupId && row.state === "closed");
  const lockedIds = new Set(records.filter(record => closed.some(calendar => calendar.period.term.id === termId || record.date >= calendar.period.term.startsOn && record.date <= calendar.period.term.endsOn)).map(row => row.id));
  const period = closed.find(calendar => calendar.period.term.id === termId);
  return { lockedIds, error: source.error, message: source.error || (period ? calendarClosedMessage(period) : lockedIds.size ? "Занятия закрытого периода доступны только для просмотра. Для изменений настройщик должен переоткрыть период." : "") };
}
