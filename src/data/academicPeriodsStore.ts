import { isAccountActive } from "../domain/accounts";
import {
  ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument, emptyAcademicPeriodsDocument, executeAcademicPeriodCommand,
  type AcademicPeriodCommand, type AcademicPeriodContext, type AcademicPeriodEvent, type AcademicPeriodsDocument,
} from "../domain/academicPeriods";
import { readAccountsState, subscribeAccounts } from "./accountStore";
import { executeAdministrationWrite } from "./administrationWrite";

export const ACADEMIC_PERIODS_CHANGE_EVENT = "bi-university-academic-periods-change";
export interface AcademicPeriodsSnapshot extends Omit<AcademicPeriodsDocument, "version" | "history"> { actorRevision: number }
export interface AcademicPeriodsHistoryRequest extends AcademicPeriodContext { entity: "year" | "term"; entityId: string; page: number }
export interface AcademicPeriodsHistoryPage { items: AcademicPeriodEvent[]; total: number; page: number; pages: number }
export interface AcademicPeriodsService {
  read(actorId: string): Promise<AcademicPeriodsSnapshot>;
  execute(command: AcademicPeriodCommand): Promise<void>;
  history(request: AcademicPeriodsHistoryRequest): Promise<AcademicPeriodsHistoryPage>;
  subscribe(listener: () => void): () => void;
}
const readDocument = () => {
  const raw = localStorage.getItem(ACADEMIC_PERIODS_STORAGE_KEY);
  return raw === null ? emptyAcademicPeriodsDocument() : decodeAcademicPeriodsDocument(raw);
};
const readActor = (actorId: string) => {
  const state = readAccountsState();
  if (state.error) throw new Error(state.error);
  const actor = state.accounts.find(row => row.id === actorId);
  if (!actor || !isAccountActive(actor)) throw new Error("Учётная запись недоступна. Обновите данные и повторите действие.");
  return actor;
};
export const academicPeriodsService: AcademicPeriodsService = {
  async read(actorId) {
    try {
      const actor = readActor(actorId), state = readDocument();
      return { revision: state.revision, actorRevision: actor.revision, years: state.years, terms: state.terms };
    } catch (error) { console.error("Не удалось прочитать учебные периоды:", error); throw error; }
  },
  async execute(command) {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const actor = readActor(captured.actorId), state = readDocument();
        const entityId = captured.type === "update-year" ? captured.yearId : captured.type === "update-term" ? captured.termId : `academic-${crypto.randomUUID()}`;
        const next = executeAcademicPeriodCommand(state, captured, actor, { entityId, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
        localStorage.setItem(ACADEMIC_PERIODS_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(ACADEMIC_PERIODS_CHANGE_EVENT));
      } catch (error) { console.error("Не удалось сохранить учебный период:", error); throw error; }
    });
  },
  async history(request) {
    try {
      const actor = readActor(request.actorId), state = readDocument();
      if (actor.role !== "configurator") throw new Error("История учебных периодов доступна только настройщику.");
      if (actor.revision !== request.actorRevision || state.revision !== request.expectedRevision) throw new Error("Справочник или учётная запись изменились. Обновите историю.");
      if ((request.entity !== "year" && request.entity !== "term") || !(request.entity === "year" ? state.years : state.terms).some(row => row.id === request.entityId)) throw new Error("Учебный период недоступен.");
      const rows = state.history.filter(row => row.entity === request.entity && row.after.id === request.entityId).reverse(), pages = Math.max(1, Math.ceil(rows.length / 20));
      if (!Number.isSafeInteger(request.page) || request.page < 1 || request.page > pages) throw new Error("Выберите корректную страницу истории.");
      return { items: rows.slice((request.page - 1) * 20, request.page * 20), total: rows.length, page: request.page, pages };
    } catch (error) { console.error("Не удалось прочитать историю учебного периода:", error); throw error; }
  },
  subscribe(listener) {
    const onStorage = (event: StorageEvent) => { if (event.key === ACADEMIC_PERIODS_STORAGE_KEY) listener(); };
    const stopAccounts = subscribeAccounts(listener);
    window.addEventListener(ACADEMIC_PERIODS_CHANGE_EVENT, listener); window.addEventListener("storage", onStorage);
    return () => { stopAccounts(); window.removeEventListener(ACADEMIC_PERIODS_CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
  },
};
