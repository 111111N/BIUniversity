import { createSubject, type CreateSubjectCommand } from "../domain/subjectCatalog";
import { readAccountsState } from "./accountStore";
import { readSubjectCatalogDocument, refreshAcademicCatalog, SUBJECT_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_STORAGE_KEY, type AcademicSubjectDefinition } from "./academicCatalog";
import { executeAdministrationWrite } from "./administrationWrite";

export { SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
export const readSubjectCatalogState = refreshAcademicCatalog;
export const subscribeSubjectCatalog = (listener: () => void) => {
  const notify = () => { refreshAcademicCatalog(); listener(); };
  const onStorage = (event: StorageEvent) => { if (event.key === SUBJECT_CATALOG_STORAGE_KEY || event.key === null) notify(); };
  window.addEventListener(SUBJECT_CATALOG_CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(SUBJECT_CATALOG_CHANGE_EVENT, notify); window.removeEventListener("storage", onStorage); };
};

export interface SubjectCatalogService {
  list(): Promise<{ subjects: AcademicSubjectDefinition[]; revision: number }>;
  create(command: CreateSubjectCommand): Promise<AcademicSubjectDefinition>;
}
export const subjectCatalogService: SubjectCatalogService = {
  async list() {
    try { const state = readSubjectCatalogDocument(); return { subjects: state.subjects, revision: state.revision }; }
    catch (error) { console.error("Не удалось загрузить список дисциплин:", error); throw error; }
  },
  async create(command) {
    return executeAdministrationWrite(() => {
      try {
        const state = readSubjectCatalogDocument();
        const accounts = readAccountsState();
        if (accounts.error) throw new Error(accounts.error);
        const id = `subject-${crypto.randomUUID()}`;
        const next = createSubject(state, command, accounts.accounts.find((account) => account.id === command.actorId), id, crypto.randomUUID(), new Date().toISOString());
        localStorage.setItem(SUBJECT_CATALOG_STORAGE_KEY, JSON.stringify(next));
        refreshAcademicCatalog();
        window.dispatchEvent(new Event(SUBJECT_CATALOG_CHANGE_EVENT));
        return next.subjects.find((subject) => subject.id === id)!;
      } catch (error) { console.error("Не удалось создать дисциплину:", error); throw error; }
    });
  },
};
