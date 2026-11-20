import { decodeScheduleTemplates, emptyScheduleTemplates, SCHEDULE_TEMPLATES_KEY } from "../domain/scheduleTemplates";
export const SCHEDULE_TEMPLATES_CHANGE_EVENT = "bi-university-schedule-templates-change";
export const readScheduleTemplatesDocument = () => { const raw = localStorage.getItem(SCHEDULE_TEMPLATES_KEY); return raw === null ? emptyScheduleTemplates() : decodeScheduleTemplates(raw); };
export const subscribeScheduleTemplates = (listener: () => void) => {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === SCHEDULE_TEMPLATES_KEY) listener(); };
  window.addEventListener(SCHEDULE_TEMPLATES_CHANGE_EVENT, listener); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(SCHEDULE_TEMPLATES_CHANGE_EVENT, listener); window.removeEventListener("storage", storage); };
};
