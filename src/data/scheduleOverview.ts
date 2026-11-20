import { readAccountsState, subscribeAccounts } from "./accountStore";
import { readManagedScheduleState, subscribeManagedSchedule } from "./managedScheduleStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { readGroupCatalogState } from "./groupCatalogStore";
import { subscribeSubjectCatalog } from "./subjectCatalogStore";
import { isAccountActive } from "../domain/accounts";
import { queryScheduleOverview, type ScheduleOverviewQuery } from "../domain/scheduleOverview";

export const scheduleOverviewService = {
  async query(actorId: string, query: ScheduleOverviewQuery) {
    try {
      const captured = structuredClone(query), accounts = readAccountsState();
      if (accounts.error) throw new Error(accounts.error);
      const actor = accounts.accounts.find(row => row.id === actorId);
      if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Обзор расписания доступен только активному настройщику.");
      const schedule = readManagedScheduleState(), subjects = refreshAcademicCatalog(), groups = readGroupCatalogState();
      if (schedule.error || subjects.error || groups.error) throw new Error(schedule.error || subjects.error || groups.error);
      return queryScheduleOverview(schedule.snapshot, { subjects: new Map(subjects.subjects.map(row => [row.id, row.name])), groups: new Map(groups.groups.map(row => [row.id, row.name])), teachers: new Map(accounts.accounts.map(row => [row.id, row.name])) }, captured);
    } catch (error) { console.error("Не удалось получить обзор опубликованного расписания:", error); throw error; }
  },
  subscribe(listener: () => void) {
    const stops = [subscribeAccounts(listener), subscribeManagedSchedule(listener), subscribeSubjectCatalog(listener)];
    return () => stops.forEach(stop => stop());
  },
};
