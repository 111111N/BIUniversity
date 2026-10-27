import { authorizeAccountCommand } from "../domain/accounts";
import { queryAdministrationChecks, type AdministrationChecksQuery, type AdministrationChecksResult } from "../domain/administrationChecks";
import { readAccountsState } from "./accountStore";
import { ACADEMIC_GROUPS, refreshAcademicCatalog } from "./academicCatalog";
import { readGroupCatalogDocument } from "./groupCatalogRead";
import { readManagedScheduleState } from "./managedScheduleStore";

export interface AdministrationChecksSnapshot extends AdministrationChecksResult {
  versions: { accounts: number; schedule: number; subjects: number; groups: number };
}
export interface AdministrationChecksService {
  list(command: { actorId: string; actorRevision: number; query: AdministrationChecksQuery }): Promise<AdministrationChecksSnapshot>;
}
export const administrationChecksService: AdministrationChecksService = {
  async list(command) {
    try {
      const accounts = readAccountsState();
      if (accounts.error) throw new Error(accounts.error);
      authorizeAccountCommand({ version: 1, accounts: accounts.accounts, revision: accounts.revision, history: accounts.history }, { actorId: command.actorId, actorRevision: command.actorRevision, expectedRevision: accounts.revision });
      const catalog = refreshAcademicCatalog();
      if (catalog.error) throw new Error("Учебный каталог недоступен. Проверка данных временно приостановлена.");
      const schedule = readManagedScheduleState();
      if (schedule.error) throw new Error(schedule.error);
      const listing = queryAdministrationChecks(accounts.accounts, ACADEMIC_GROUPS, catalog.subjects, schedule.snapshot.published, command.query, new Date().toISOString());
      return { ...listing, versions: { accounts: accounts.revision, schedule: schedule.snapshot.revision, subjects: catalog.revision, groups: readGroupCatalogDocument().revision } };
    } catch (error) { console.error("Не удалось выполнить проверку административных данных:", error); throw error; }
  },
};
