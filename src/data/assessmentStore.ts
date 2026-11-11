import { createAccount, decodeAccountsDocument, getStudentGroupId, isAccountActive } from "../domain/accounts";
import { isStudyingStudent } from "../domain/studentEnrollment";
import { applyAssessmentCommand, decodeAssessmentDocument, emptyAssessmentDocument, manageableAssessmentAttemptIds, manageableSupervisorAssessmentIds, projectAssessments } from "../domain/assessments";
import type { AssessmentCommand, AssessmentDocument, AssessmentService, AssessmentSnapshot } from "../domain/assessmentTypes";
import { ASSESSMENTS_STORAGE_KEY } from "../domain/assessmentTypes";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState, subscribeAccounts } from "./accountStore";
import { appendAssessmentDemo, repairAssessmentDemoText } from "./demo/assessments";
import { ACADEMIC_GROUPS, refreshAcademicCatalog, readSubjectCatalogDocument, SUBJECT_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import { GROUP_CATALOG_CHANGE_EVENT, GROUP_CATALOG_STORAGE_KEY, readGroupCatalogDocument } from "./groupCatalogRead";
import { executeAdministrationWrite } from "./administrationWrite";
import { createAssessmentStatement } from "../domain/assessmentExport";
import { readAssessmentAttemptHistory } from "../domain/assessmentHistory";

export { ASSESSMENTS_STORAGE_KEY };
export const ASSESSMENTS_CHANGE_EVENT = "bi-university-assessments-change";

const readDocument = (): AssessmentDocument => {
  const raw = localStorage.getItem(ASSESSMENTS_STORAGE_KEY);
  return raw === null ? emptyAssessmentDocument() : repairAssessmentDemoText(decodeAssessmentDocument(raw));
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

/** Explicit demo import only; ordinary reads never seed data. */
export const appendAssessmentDemoRecords = (): Promise<{ assessments: number; assessmentAttempts: number }> => executeAdministrationWrite(() => {
  const state = readDocument();
  const { context } = readContext("configurator-demo");
  const rawAccounts = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  let accounts = rawAccounts === null ? createInitialAccountsDocument() : decodeAccountsDocument(rawAccounts);
  const now = new Date();
  let addedAccount = false;
  if (!context.accounts.some((account) => account.role === "teacher" && account.id !== "teacher-elena-volkova" && isAccountActive(account))) {
    const actor = accounts.accounts.find((account) => account.id === "configurator-demo")!;
    accounts = createAccount(accounts, { actorId: actor.id, actorRevision: actor.revision, expectedRevision: accounts.revision, draft: { name: "Иван Петров (демо-комиссия)", login: "demo.assessment.commission", role: "teacher", memberships: [] } }, "demo-assessment-commission-teacher", "demo-assessment-commission-teacher:created", now.toISOString());
    decodeAccountsDocument(JSON.stringify(accounts));
    context.accounts = accounts.accounts;
    context.accountsRevision = accounts.revision;
    addedAccount = true;
  }
  const next = appendAssessmentDemo(state, context, now);
  const counts = { assessments: next.assessments.length - state.assessments.length, assessmentAttempts: next.assessments.reduce((sum, item) => sum + item.attempts.length, 0) - state.assessments.reduce((sum, item) => sum + item.attempts.length, 0) };
  if (!counts.assessments) return counts;
  const serialized = JSON.stringify(next);
  decodeAssessmentDocument(serialized);
  // Persist the referenced account first. A failed assessment write can be retried without duplicating it.
  if (addedAccount) {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    if (typeof window !== "undefined") window.dispatchEvent(new Event("bi-university-accounts-change"));
  }
  localStorage.setItem(ASSESSMENTS_STORAGE_KEY, serialized);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ASSESSMENTS_CHANGE_EVENT));
  return counts;
});

/** The UI depends on this asynchronous boundary, rather than local storage or account documents. */
export const assessmentService: AssessmentService = {
  async readAttemptHistory(request) {
    try {
      const input = structuredClone(request);
      const { context } = readContext(input.actorId);
      return readAssessmentAttemptHistory(readDocument(), input, context);
    } catch (error) {
      console.error("Не удалось прочитать историю назначения аттестации:", error);
      throw error instanceof Error ? error : new Error("Не удалось загрузить историю назначения. Повторите попытку.");
    }
  },
  async exportStatement(request) {
    try {
      const input = structuredClone(request);
      const { context } = readContext(input.actorId);
      return createAssessmentStatement(readDocument(), input, context);
    } catch (error) {
      console.error("Не удалось подготовить ведомость для скачивания:", error);
      throw error instanceof Error ? error : new Error("Не удалось подготовить ведомость. Обновите данные и повторите попытку.");
    }
  },
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
      const visibleAttempts = new Set(assessments.flatMap((assessment) => assessment.attempts.map((attempt) => attempt.id)));
      const corrections = actor.role === "student" ? [] : state.corrections.filter((entry) => visibleAttempts.has(entry.attemptId));
      return {
        revision: state.revision, actorRevision: actor.revision,
        accountsRevision: context.accountsRevision, groupRevision: context.groupRevision, subjectRevision: context.subjectRevision,
        assessments,
        ...(configure ? { manageableAttemptIds: manageableAssessmentAttemptIds(state), manageableSupervisorAssessmentIds: manageableSupervisorAssessmentIds(state) } : {}),
        ...(actor.role === "student" ? {} : { corrections: structuredClone(corrections.filter((entry) => entry.state === "draft")), correctionPublications: corrections.filter((entry) => entry.state === "published").map(({ results: _results, ...entry }) => ({ ...entry })) }),
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

