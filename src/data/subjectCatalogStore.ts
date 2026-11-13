import { createSubject, updateSubject, changeSubjectStatus, authorizeSubjectTarget, subjectArchiveBlockers, type CreateSubjectCommand, type SubjectTargetCommand, type UpdateSubjectCommand, type ChangeSubjectStatusCommand, type SubjectDependencies, type SubjectChange, type SubjectCatalogDocument } from "../domain/subjectCatalog";
import { getSubjectDependencies } from "../domain/subjectDependencies";
import { decodeAssessmentDocument, emptyAssessmentDocument } from "../domain/assessments";
import { ASSESSMENTS_STORAGE_KEY } from "../domain/assessmentTypes";
import { readManagedScheduleState } from "./managedScheduleStore";
import { readAccountsState } from "./accountStore";
import { readSubjectCatalogDocument, refreshAcademicCatalog, SUBJECT_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_STORAGE_KEY, type AcademicSubjectDefinition } from "./academicCatalog";
import { executeAdministrationWrite } from "./administrationWrite";
import { GROUP_CATALOG_CHANGE_EVENT, GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";

export { SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
export const readSubjectCatalogState = refreshAcademicCatalog;
export const subscribeSubjectCatalog = (listener: () => void) => {
  const notify = () => { refreshAcademicCatalog(); listener(); };
  const onStorage = (event: StorageEvent) => { if (event.key === SUBJECT_CATALOG_STORAGE_KEY || event.key === GROUP_CATALOG_STORAGE_KEY || event.key === null) notify(); };
  window.addEventListener(SUBJECT_CATALOG_CHANGE_EVENT, notify);
  window.addEventListener(GROUP_CATALOG_CHANGE_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(SUBJECT_CATALOG_CHANGE_EVENT, notify); window.removeEventListener(GROUP_CATALOG_CHANGE_EVENT, notify); window.removeEventListener("storage", onStorage); };
};

export interface SubjectCatalogService {
  list(): Promise<{ subjects: AcademicSubjectDefinition[]; revision: number }>;
  create(command: CreateSubjectCommand): Promise<AcademicSubjectDefinition>;
  update(command: UpdateSubjectCommand): Promise<AcademicSubjectDefinition>;
  previewStatus(command: SubjectTargetCommand): Promise<SubjectStatusPreview>;
  changeStatus(command: ChangeSubjectStatusCommand): Promise<AcademicSubjectDefinition>;
  history(command: SubjectTargetCommand & { page: number }): Promise<{ items: SubjectChange[]; page: number; pages: number; total: number }>;
}
export interface SubjectStatusPreview extends SubjectTargetCommand { dependencies: SubjectDependencies; blockers: string[]; expectedAccountsRevision: number; expectedScheduleRevision: number; expectedAssessmentRevision: number }
const targetContext = (command: SubjectTargetCommand) => {
  const state = readSubjectCatalogDocument(), accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find(row => row.id === command.actorId);
  authorizeSubjectTarget(state, command, actor);
  return { state, accounts, actor };
};
const dependencyContext = (command: SubjectTargetCommand) => {
  const context = targetContext(command), schedule = readManagedScheduleState();
  if (schedule.error) throw new Error("Не удалось проверить расписание. Изменение состояния дисциплины остановлено.");
  const raw = localStorage.getItem(ASSESSMENTS_STORAGE_KEY), assessments = raw === null ? emptyAssessmentDocument() : decodeAssessmentDocument(raw);
  return { ...context, schedule: schedule.snapshot, assessments, dependencies: getSubjectDependencies(command.subjectId, context.accounts.accounts, schedule.snapshot, assessments, Date.now()) };
};
const save = (state: SubjectCatalogDocument, subjectId: string) => {
  localStorage.setItem(SUBJECT_CATALOG_STORAGE_KEY, JSON.stringify(state)); refreshAcademicCatalog(); window.dispatchEvent(new Event(SUBJECT_CATALOG_CHANGE_EVENT));
  return state.subjects.find(row => row.id === subjectId)!;
};
export const subjectCatalogService: SubjectCatalogService = {
  async history(command) {
    try {
      const { state } = targetContext(command);
      if (!Number.isSafeInteger(command.page) || command.page < 1) throw new Error("Выберите корректную страницу истории.");
      const rows = state.history.filter(row => row.subjectId === command.subjectId).reverse(), pages = Math.max(1, Math.ceil(rows.length / 20));
      if (command.page > pages) throw new Error("История обновилась. Откройте первую страницу.");
      return { items: structuredClone(rows.slice((command.page - 1) * 20, command.page * 20)), total: rows.length, page: command.page, pages };
    } catch (error) { console.error("Не удалось прочитать историю дисциплины:", error); throw error; }
  },
  async update(command) {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try { const { state, actor } = targetContext(captured); return save(updateSubject(state, captured, actor, crypto.randomUUID(), new Date().toISOString()), captured.subjectId); }
      catch (error) { console.error("Не удалось изменить дисциплину:", error); throw error; }
    });
  },
  async previewStatus(command) {
    try {
      const context = dependencyContext(command);
      return { ...command, dependencies: context.dependencies, blockers: subjectArchiveBlockers(context.dependencies), expectedAccountsRevision: context.accounts.revision, expectedScheduleRevision: context.schedule.revision, expectedAssessmentRevision: context.assessments.revision };
    } catch (error) { console.error("Не удалось проверить зависимости дисциплины:", error); throw error; }
  },
  async changeStatus(command) {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const context = dependencyContext(captured);
        if (captured.expectedAccountsRevision !== context.accounts.revision || captured.expectedScheduleRevision !== context.schedule.revision || captured.expectedAssessmentRevision !== context.assessments.revision) throw new Error("Назначения, расписание или аттестации изменились. Проверьте зависимости заново.");
        return save(changeSubjectStatus(context.state, captured, context.actor, context.dependencies, crypto.randomUUID(), new Date().toISOString()), captured.subjectId);
      } catch (error) { console.error("Не удалось изменить состояние дисциплины:", error); throw error; }
    });
  },
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
