import { readAccountsState, subscribeAccounts } from "./accountStore";
import { executeAdministrationWrite } from "./administrationWrite";
import { isAccountActive } from "../domain/accounts";
import { EDUCATION_DIRECTORIES_KEY, decodeEducationDirectories, emptyEducationDirectories, executeEducationDirectoryCommand, type EducationDirectoriesDocument, type EducationDirectoryCommand, type EducationDirectoryContext } from "../domain/educationDirectories";

const CHANGE_EVENT = "bi-university-education-directories-change";
export const readEducationDirectoriesDocument = (): EducationDirectoriesDocument => {
  const raw = localStorage.getItem(EDUCATION_DIRECTORIES_KEY);
  return raw === null ? emptyEducationDirectories() : decodeEducationDirectories(raw);
};
const readActor = (actorId: string) => {
  const state = readAccountsState();
  if (state.error) throw new Error(state.error);
  const actor = state.accounts.find(row => row.id === actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Управление программами доступно только действующему настройщику.");
  return actor;
};
export type EducationDirectoriesSnapshot = Omit<EducationDirectoriesDocument, "version" | "history"> & { actorRevision: number };
export interface EducationDirectoryHistoryRequest extends EducationDirectoryContext { entity: "program" | "form"; entityId: string; page: number }
export const educationDirectoriesService = {
  async read(actorId: string): Promise<EducationDirectoriesSnapshot> {
    try { const actor = readActor(actorId), state = readEducationDirectoriesDocument(); return { programs: state.programs, forms: state.forms, revision: state.revision, actorRevision: actor.revision }; }
    catch (error) { console.error("Не удалось прочитать программы и формы обучения:", error); throw error; }
  },
  async execute(command: EducationDirectoryCommand): Promise<void> {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const next = executeEducationDirectoryCommand(readEducationDirectoriesDocument(), captured, readActor(captured.actorId), { entityId: captured.entityId ?? crypto.randomUUID(), eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
        localStorage.setItem(EDUCATION_DIRECTORIES_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch (error) { console.error("Не удалось сохранить программу или форму обучения:", error); throw error; }
    });
  },
  async history(request: EducationDirectoryHistoryRequest) {
    try {
      const actor = readActor(request.actorId), state = readEducationDirectoriesDocument();
      if (state.revision !== request.expectedRevision || actor.revision !== request.actorRevision) throw new Error("Справочник или права изменились. Обновите историю.");
      if (!Number.isSafeInteger(request.page) || request.page < 1 || !["program", "form"].includes(request.entity)) throw new Error("Выберите корректную страницу истории.");
      if (!(request.entity === "program" ? state.programs : state.forms).some(row => row.id === request.entityId)) throw new Error("Запись справочника недоступна.");
      const rows = state.history.filter(row => row.entity === request.entity && row.after.id === request.entityId).reverse();
      const pages = Math.max(1, Math.ceil(rows.length / 20)), page = Math.min(request.page, pages);
      return { items: rows.slice((page - 1) * 20, page * 20), page, pages, total: rows.length };
    } catch (error) { console.error("Не удалось прочитать историю программ и форм обучения:", error); throw error; }
  },
  subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => { if (event.key === EDUCATION_DIRECTORIES_KEY || event.key === null) listener(); };
    window.addEventListener(CHANGE_EVENT, listener); window.addEventListener("storage", onStorage);
    const stop = subscribeAccounts(listener);
    return () => { stop(); window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
  },
};
