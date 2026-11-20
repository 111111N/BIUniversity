import { readAccountsState, subscribeAccounts } from "./accountStore";
import { readGroupCatalogState, subscribeGroupCatalog } from "./groupCatalogStore";
import { academicPeriodsService } from "./academicPeriodsStore";
import { executeAdministrationWrite } from "./administrationWrite";
import { GROUP_CALENDARS_CHANGE_EVENT, readGroupCalendarsDocument, subscribeGroupCalendars } from "./groupCalendarRead";
import { ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument, emptyAcademicPeriodsDocument } from "../domain/academicPeriods";
import { isAccountActive } from "../domain/accounts";
import { executeGroupCalendarCommand, shiftedCalendarContents } from "../domain/groupCalendars";
import { GROUP_CALENDARS_KEY, type GroupCalendarCommand, type GroupCalendarContext, type GroupCalendarEvent } from "../domain/groupCalendarTypes";
import { resolveAssessmentAcademicPeriod } from "../domain/assessmentPeriods";

const sources = (actorId: string) => {
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find(row => row.id === actorId);
  if (!actor || !isAccountActive(actor) || actor.role !== "configurator") throw new Error("Учебные календари доступны только действующему настройщику.");
  const groups = readGroupCatalogState(); if (groups.error) throw new Error(groups.error);
  const raw = localStorage.getItem(ACADEMIC_PERIODS_STORAGE_KEY), periods = raw === null ? emptyAcademicPeriodsDocument() : decodeAcademicPeriodsDocument(raw);
  const state = readGroupCalendarsDocument();
  const dependencies = { groupsRevision: groups.revision, groups: groups.groups.map(row => ({ id: row.id, name: row.name, revision: groups.managed.find(item => item.id === row.id)?.revision ?? 0 })), archivedGroupIds: groups.groups.filter(row => row.status === "archived").map(row => row.id), periods };
  const context: GroupCalendarContext = { actorId, actorRevision: actor.revision, expectedRevision: state.revision, groupsRevision: groups.revision, periodsRevision: periods.revision };
  return { actor, state, dependencies, context };
};
export type GroupCalendarsSnapshot = Awaited<ReturnType<typeof groupCalendarsService.read>>;
export const groupCalendarsService = {
  async read(actorId: string) {
    try { const source = sources(actorId); return { context: source.context, calendars: source.state.calendars, groups: source.dependencies.groups, archivedGroupIds: source.dependencies.archivedGroupIds, years: source.dependencies.periods.years, terms: source.dependencies.periods.terms }; }
    catch (error) { console.error("Не удалось прочитать учебные календари:", error); throw error; }
  },
  async execute(command: GroupCalendarCommand): Promise<void> {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const source = sources(captured.actorId);
        const next = executeGroupCalendarCommand(source.state, captured, source.actor, source.dependencies, { id: crypto.randomUUID(), eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() });
        localStorage.setItem(GROUP_CALENDARS_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(GROUP_CALENDARS_CHANGE_EVENT));
      } catch (error) { console.error("Не удалось сохранить календарь или состояние периода. Исходные данные сохранены:", error); throw error; }
    });
  },
  async previewCopy(context: GroupCalendarContext, sourceId: string, groupId: string, termId: string) {
    try {
      const source = sources(context.actorId);
      if (JSON.stringify(context) !== JSON.stringify(source.context)) throw new Error("Данные изменились. Обновите проверку копирования.");
      const original = source.state.calendars.find(row => row.id === sourceId), destination = source.state.calendars.find(row => row.group.id === groupId && row.period.term.id === termId);
      if (!original || original.id === destination?.id || destination?.state === "closed" || source.dependencies.archivedGroupIds.includes(groupId) || !source.dependencies.groups.some(row => row.id === groupId)) throw new Error("Выберите другой календарь и действующую группу с открытым периодом.");
      const period = resolveAssessmentAcademicPeriod(source.dependencies.periods, { termId, expectedRevision: context.periodsRevision }, new Date().toISOString());
      return { contents: shiftedCalendarContents(original, period), sourceRevision: original.revision, calendarRevision: destination?.revision ?? 0, sourceName: `${original.group.name} · ${original.period.year.name} · ${original.period.term.name}`, replaces: Boolean(destination) };
    } catch (error) { console.error("Не удалось подготовить копирование учебного календаря:", error); throw error; }
  },
  async history(context: GroupCalendarContext, id: string, page: number) {
    try {
      const source = sources(context.actorId);
      if (JSON.stringify(context) !== JSON.stringify(source.context)) throw new Error("Календарь или права изменились. Перечитайте историю.");
      if (!Number.isSafeInteger(page) || page < 1 || !source.state.calendars.some(row => row.id === id)) throw new Error("Календарь или страница истории недоступны.");
      const all = source.state.history.filter(event => event.after.id === id).reverse(), pages = Math.max(1, Math.ceil(all.length / 20)), current = Math.min(page, pages);
      const items: GroupCalendarEvent[] = all.slice((current - 1) * 20, current * 20);
      return { items, total: all.length, page: current, pages };
    } catch (error) { console.error("Не удалось прочитать историю учебного календаря:", error); throw error; }
  },
  subscribe(listener: () => void) {
    const stops = [subscribeGroupCalendars(listener), subscribeAccounts(listener), subscribeGroupCatalog(listener), academicPeriodsService.subscribe(listener)];
    return () => stops.forEach(stop => stop());
  },
};
