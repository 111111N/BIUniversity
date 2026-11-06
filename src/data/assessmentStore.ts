import { getStudentGroupId, isAccountActive } from "../domain/accounts";
import { isStudyingStudent } from "../domain/studentEnrollment";
import { applyAssessmentCommand, decodeAssessmentDocument, emptyAssessmentDocument, projectAssessments } from "../domain/assessments";
import type { AssessmentCommand, AssessmentDocument, AssessmentService, AssessmentSnapshot } from "../domain/assessmentTypes";
import { readAccountsState, subscribeAccounts } from "./accountStore";
import { ACADEMIC_GROUPS, refreshAcademicCatalog, readSubjectCatalogDocument, SUBJECT_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import { GROUP_CATALOG_CHANGE_EVENT, GROUP_CATALOG_STORAGE_KEY, readGroupCatalogDocument } from "./groupCatalogRead";
import { executeAdministrationWrite } from "./administrationWrite";

export const ASSESSMENTS_STORAGE_KEY = "bi-university-assessments-v1";
export const ASSESSMENTS_CHANGE_EVENT = "bi-university-assessments-change";

const readDocument = (): AssessmentDocument => {
  const raw = localStorage.getItem(ASSESSMENTS_STORAGE_KEY);
  return raw === null ? emptyAssessmentDocument() : decodeAssessmentDocument(raw);
};

const readContext = (actorId: string) => {
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find((account) => account.id === actorId);
  if (!actor || !isAccountActive(actor)) throw new Error("Учёт аттестаций доступен только из действующей учётной записи.");
  const catalog = refreshAcademicCatalog();
  if (catalog.error) throw new Error("Учебный каталог недоступен. Работа с аттестациями приостановлена, исходные данные сохранены.");
  const groups = readGroupCatalogDocument();
  const subjects = readSubjectCatalogDocument();
  return {
    actor,
    context: {
      accounts: accounts.accounts, accountsRevision: accounts.revision,
      groups: ACADEMIC_GROUPS.map(({ id, name, status }) => ({ id, name, status })), groupRevision: groups.revision,
      subjects: subjects.subjects.map(({ id, name }) => ({ id, name })), subjectRevision: subjects.revision,
    },
  };
};

const subscribe = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  const keys = new Set([ASSESSMENTS_STORAGE_KEY, GROUP_CATALOG_STORAGE_KEY, SUBJECT_CATALOG_STORAGE_KEY]);
  // The account subscription already handles storage.clear(), so notify that shared event only once.
  const storage = (event: StorageEvent) => { if (event.key !== null && keys.has(event.key)) listener(); };
  const visibility = () => { if (typeof document === "undefined" || document.visibilityState === "visible") listener(); };
  const events = [ASSESSMENTS_CHANGE_EVENT, GROUP_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_CHANGE_EVENT, "focus"];
  const stopAccounts = subscribeAccounts(listener);
  window.addEventListener("storage", storage);
  for (const event of events) window.addEventListener(event, listener);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility);
  return () => {
    stopAccounts();
    window.removeEventListener("storage", storage);
    for (const event of events) window.removeEventListener(event, listener);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility);
  };
};

/** The UI depends on this asynchronous boundary, rather than local storage or account documents. */
export const assessmentService: AssessmentService = {
  async read(actorId): Promise<AssessmentSnapshot> {
    try {
      const { actor, context } = readContext(actorId);
      const state = readDocument();
      const assessments = projectAssessments(state, actor);
      const configure = actor.role === "configurator";
      const teacherIds = new Set(assessments.flatMap((assessment) => [
        ...(assessment.supervisorId ? [assessment.supervisorId] : []),
        ...assessment.attempts.flatMap((attempt) => [attempt.teacherId, ...(attempt.chairId ? [attempt.chairId] : []), ...attempt.memberIds]),
      ]));
      const groupIds = new Set(assessments.map((assessment) => assessment.groupId));
      const subjectIds = new Set(assessments.map((assessment) => assessment.subjectId));
      return {
        revision: state.revision, actorRevision: actor.revision,
        accountsRevision: context.accountsRevision, groupRevision: context.groupRevision, subjectRevision: context.subjectRevision,
        assessments,
        groups: context.groups.filter((group) => configure || groupIds.has(group.id)),
        subjects: context.subjects.filter((subject) => configure || subjectIds.has(subject.id)),
        teachers: context.accounts.filter((account) => account.role === "teacher" && (configure ? isAccountActive(account) : teacherIds.has(account.id))).map(({ id, name }) => ({ id, name })),
        students: configure ? context.accounts.flatMap((account) => {
          const groupId = getStudentGroupId(account);
          return groupId && isStudyingStudent(account)
            ? [{ studentId: account.id, name: account.name, studentNumber: account.studentRecord?.number ?? null, groupId }] : [];
        }) : [],
      };
    } catch (error) {
      console.error("Не удалось прочитать аттестации. Исходные данные не изменены:", error);
      throw error instanceof Error ? error : new Error("Не удалось прочитать аттестации. Обновите страницу и повторите попытку.");
    }
  },
  async execute(command: AssessmentCommand): Promise<void> {
    try {
      // Copy before entering the shared asynchronous queue: form edits must not change an accepted command.
      const input = structuredClone(command);
      await executeAdministrationWrite(() => {
        const { context } = readContext(input.actorId);
        const state = readDocument();
        const next = applyAssessmentCommand(state, input, context, {
          assessmentId: crypto.randomUUID(), attemptId: crypto.randomUUID(), historyId: crypto.randomUUID(), occurredAt: new Date().toISOString(),
        });
        const serialized = JSON.stringify(next);
        decodeAssessmentDocument(serialized);
        try { localStorage.setItem(ASSESSMENTS_STORAGE_KEY, serialized); }
        catch (error) {
          console.error("Хранилище не приняло ведомость аттестации:", error);
          throw new Error("Не удалось сохранить аттестацию в браузере. Проверьте доступное место и повторите попытку; изменения не сохранены.");
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event(ASSESSMENTS_CHANGE_EVENT));
      });
    } catch (error) {
      console.error("Не удалось изменить аттестацию:", error);
      throw error instanceof Error ? error : new Error("Не удалось изменить аттестацию. Обновите данные и повторите попытку.");
    }
  },
  subscribe,
};

