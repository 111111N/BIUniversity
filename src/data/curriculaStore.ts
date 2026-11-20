import { readAccountsState, subscribeAccounts } from "./accountStore";
import { executeAdministrationWrite } from "./administrationWrite";
import { readEducationDirectoriesDocument, educationDirectoriesService } from "./educationDirectoriesStore";
import { readGroupCatalogState, subscribeGroupCatalog } from "./groupCatalogStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { academicPeriodsService } from "./academicPeriodsStore";
import { ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument, emptyAcademicPeriodsDocument } from "../domain/academicPeriods";
import { isAccountActive } from "../domain/accounts";
import { readGroupCalendarsDocument } from "./groupCalendarRead";
import { calendarClosedMessage } from "../domain/groupCalendars";
import { decodeCurricula, executeCurriculumCommand, type CurriculumDependencies } from "../domain/curricula";
import { CURRICULA_KEY, emptyCurricula, type CurriculumCommand, type CurriculumContext, type CurriculumEvent } from "../domain/curriculumTypes";

const CHANGE_EVENT = "bi-university-curricula-change";
const readDocument = () => { const raw = localStorage.getItem(CURRICULA_KEY); return raw === null ? emptyCurricula() : decodeCurricula(raw); };
const sources = (actorId: string) => {
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find(row => row.id === actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Учебные планы доступны только действующему настройщику.");
  const groups = readGroupCatalogState(), subjects = refreshAcademicCatalog();
  if (groups.error || subjects.error) throw new Error(groups.error || subjects.error);
  const raw = localStorage.getItem(ACADEMIC_PERIODS_STORAGE_KEY);
  const dependencies: CurriculumDependencies = {
    directories: readEducationDirectoriesDocument(), periods: raw === null ? emptyAcademicPeriodsDocument() : decodeAcademicPeriodsDocument(raw),
    subjects: { revision: subjects.revision, rows: subjects.subjects },
    groups: { revision: groups.revision, rows: groups.groups.map(group => ({ id: group.id, name: group.name, status: group.status, revision: groups.managed.find(row => row.id === group.id)?.revision ?? 0 })) },
  };
  const state = readDocument();
  const context: CurriculumContext = { actorId, actorRevision: actor.revision, expectedRevision: state.revision, directoriesRevision: dependencies.directories.revision, subjectsRevision: dependencies.subjects.revision, groupsRevision: dependencies.groups.revision, periodsRevision: dependencies.periods.revision };
  return { actor, dependencies, state, context };
};
export type CurriculumSnapshot = ReturnType<typeof snapshot>;
const snapshot = (source: ReturnType<typeof sources>) => ({ context: source.context, plans: source.state.plans, bindings: source.state.bindings,
  programs: source.dependencies.directories.programs, forms: source.dependencies.directories.forms, subjects: source.dependencies.subjects.rows,
  groups: source.dependencies.groups.rows, years: source.dependencies.periods.years, terms: source.dependencies.periods.terms,
});
export const curriculaService = {
  async read(actorId: string) {
    try { return snapshot(sources(actorId)); }
    catch (error) { console.error("Не удалось прочитать учебные планы и их справочники:", error); throw error; }
  },
  async execute(command: CurriculumCommand): Promise<void> {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const source = sources(captured.actorId);
        if (captured.type === "bind") {
          const previous = source.state.bindings.find(row => row.group.id === captured.groupId);
          const locked = readGroupCalendarsDocument().calendars.find(calendar => calendar.state === "closed" && calendar.group.id === captured.groupId && previous?.periods.some(entry => entry.period.term.id === calendar.period.term.id) && (previous.planId !== captured.planId || previous.periods.some(entry => entry.period.term.id === calendar.period.term.id && !captured.periods.some(next => next.semester === entry.semester && next.termId === entry.period.term.id))));
          if (locked) throw new Error(calendarClosedMessage(locked));
        }
        const next = executeCurriculumCommand(source.state, captured, source.actor, source.dependencies, { id: crypto.randomUUID(), eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
        localStorage.setItem(CURRICULA_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch (error) { console.error("Не удалось сохранить учебный план или назначение группы. Исходные данные сохранены:", error); throw error; }
    });
  },
  async history(context: CurriculumContext, entity: CurriculumEvent["entity"], id: string, page: number) {
    try {
      const source = sources(context.actorId);
      if (Object.keys(context).some(key => context[key as keyof CurriculumContext] !== source.context[key as keyof CurriculumContext])) throw new Error("Справочники или права изменились. Перечитайте историю.");
      if (!Number.isSafeInteger(page) || page < 1 || !["plan", "binding"].includes(entity)) throw new Error("Выберите корректную страницу истории.");
      const rows = source.state.history.filter(event => entity === "plan" ? event.entity === "plan" && event.after.id === id : event.entity === "binding" && event.after.group.id === id).reverse();
      const pages = Math.max(1, Math.ceil(rows.length / 20)), currentPage = Math.min(page, pages);
      const items = rows.slice((currentPage - 1) * 20, currentPage * 20), planIds = new Set(items.flatMap(event => event.entity === "binding" ? [event.after.planId] : []));
      const planLabels = Object.fromEntries(source.state.plans.filter(plan => planIds.has(plan.id)).map(plan => [plan.id, `${plan.name} · версия ${plan.number}`]));
      return { items, planLabels, page: currentPage, pages, total: rows.length };
    } catch (error) { console.error("Не удалось прочитать историю учебного плана:", error); throw error; }
  },
  subscribe(listener: () => void) {
    const onStorage = (event: StorageEvent) => { if (event.key === CURRICULA_KEY || event.key === null) listener(); };
    window.addEventListener(CHANGE_EVENT, listener); window.addEventListener("storage", onStorage);
    const stops = [subscribeAccounts(listener), subscribeGroupCatalog(listener), educationDirectoriesService.subscribe(listener), academicPeriodsService.subscribe(listener)];
    return () => { stops.forEach(stop => stop()); window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener("storage", onStorage); };
  },
};
