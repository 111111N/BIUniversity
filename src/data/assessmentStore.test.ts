import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendAssessmentDemoRecords, assessmentService, ASSESSMENTS_CHANGE_EVENT, ASSESSMENTS_STORAGE_KEY } from "./assessmentStore";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { executeAdministrationWrite } from "./administrationWrite";
import { createInitialSubjectCatalogDocument, refreshAcademicCatalog, SUBJECT_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import { GROUP_CATALOG_CHANGE_EVENT, GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
import { emptyGroupCatalog } from "../domain/groupCatalog";
import { ASSESSMENT_KIND_LABELS, type AssessmentCommand, type AssessmentSnapshot } from "../domain/assessmentTypes";
import { assessmentAttemptAssignment, decodeAssessmentDocument } from "../domain/assessments";
import { ACADEMIC_PERIODS_STORAGE_KEY } from "../domain/academicPeriods";
import { academicPeriodsFixture } from "../testSupport/academicPeriods";
import { academicPeriodsService, ACADEMIC_PERIODS_CHANGE_EVENT } from "./academicPeriodsStore";

let values: Map<string, string>;
let write: ReturnType<typeof vi.fn>;
const teacherId = "teacher-elena-volkova";
const studentId = "anna-smirnova";
const actorId = "configurator-demo";
const context = { actorId, actorRevision: 1, expectedRevision: 0, accountsRevision: 0, groupRevision: 0, subjectRevision: 0 };
const createCommand = (): AssessmentCommand => ({
  ...context, type: "create", draft: {
    title: "Экзамен по теории вероятностей", kind: "exam", groupId: "112-mko", subjectId: "theory-of-probability", period: "2026/2027 · осенний семестр",
    academicPeriod: { termId: "term-autumn", expectedRevision: 2 },
    attempt: { date: "2026-11-06", startsAt: "12:00", teacherId, chairId: null, memberIds: [], studentIds: [studentId] },
  },
});
const commandContext = (snapshot: AssessmentSnapshot, id: string) => ({
  actorId: id, actorRevision: snapshot.actorRevision, expectedRevision: snapshot.revision,
  accountsRevision: snapshot.accountsRevision, groupRevision: snapshot.groupRevision, subjectRevision: snapshot.subjectRevision,
});
const create = async () => { await assessmentService.execute(createCommand()); return (await assessmentService.read(actorId)).assessments[0]; };
const publishedStatement = async () => {
  const assessment = await create();
  let snapshot = await assessmentService.read(teacherId);
  await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, results: [{ studentId, outcome: { status: "graded", grade: 5 } }] });
  snapshot = await assessmentService.read(teacherId);
  await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "publish", assessmentId: assessment.id, attemptId: assessment.attempts[0].id });
  return assessment;
};

beforeEach(() => {
  values = new Map();
  values.set(ACADEMIC_PERIODS_STORAGE_KEY, JSON.stringify(academicPeriodsFixture()));
  write = vi.fn((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: write });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("assessment statement export service", () => {
  it("prepares teacher and configurator files without writing storage or changing history", async () => {
    const assessment = await publishedStatement();
    const before = new Map(values);
    write.mockClear();
    for (const id of [teacherId, actorId]) {
      const snapshot = await assessmentService.read(id);
      const file = await assessmentService.exportStatement({ ...commandContext(snapshot, id), assessmentId: assessment.id, attemptId: assessment.attempts[0].id });
      expect(file.csv).toContain("Анна Смирнова"); expect(file.filename).toMatch(/\.csv$/);
    }
    expect(write).not.toHaveBeenCalled(); expect(values).toEqual(before);
  });
  it("does not allow a student to export a full statement even when the personal result is visible", async () => {
    const assessment = await publishedStatement();
    const snapshot = await assessmentService.read(studentId);
    expect(snapshot.assessments[0].attempts[0].state).toBe("published");
    await expect(assessmentService.exportStatement({ ...commandContext(snapshot, studentId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id })).rejects.toThrow("назначенный преподаватель");
  });
  it("rechecks revisions and a blocked actor instead of trusting the retained page snapshot", async () => {
    const assessment = await publishedStatement();
    const snapshot = await assessmentService.read(teacherId);
    const request = { ...commandContext(snapshot, teacherId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id };
    const admin = await assessmentService.read(actorId);
    await assessmentService.execute({ ...commandContext(admin, actorId), type: "update-record-book", assessmentId: assessment.id, recordBook: { semester: 2, hours: 72, category: "required" } });
    await expect(assessmentService.exportStatement(request)).rejects.toThrow("изменились");
    const accounts = createInitialAccountsDocument();
    accounts.accounts.find((entry) => entry.id === teacherId)!.status = "blocked";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    await expect(assessmentService.exportStatement(request)).rejects.toThrow("действующей");
  });
  it("keeps damaged assessment storage intact when preparing a file fails", async () => {
    const assessment = await publishedStatement();
    const snapshot = await assessmentService.read(teacherId);
    values.set(ASSESSMENTS_STORAGE_KEY, "{damaged"); write.mockClear();
    await expect(assessmentService.exportStatement({ ...commandContext(snapshot, teacherId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id })).rejects.toThrow();
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe("{damaged"); expect(write).not.toHaveBeenCalled();
  });
});

describe("supervisor replacement persistence", () => {
  const setup = async () => {
    const accounts = createInitialAccountsDocument(); const teacher = accounts.accounts.find((account) => account.id === teacherId)!;
    const replacementId = "supervisor-replacement";
    accounts.accounts.push({ ...teacher, id: replacementId, login: "replacement.teacher", name: "Новый руководитель" });
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    const command = createCommand(); if (command.type !== "create") throw new Error("Expected create command");
    command.draft.kind = "thesis";
    await assessmentService.execute(command);
    const snapshot = await assessmentService.read(actorId); const assessment = snapshot.assessments[0];
    return { replacementId, snapshot, assessment };
  };
  it("changes current access, persists prior assignments, and exposes the capability only to the configurator", async () => {
    const { replacementId, snapshot, assessment } = await setup();
    expect(snapshot.manageableSupervisorAssessmentIds).toEqual([assessment.id]);
    const original = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    await assessmentService.execute({ ...commandContext(snapshot, actorId), type: "change-supervisor", assessmentId: assessment.id, teacherId: replacementId, reason: "PRIVATE SUPERVISOR REASON" });
    expect((await assessmentService.read(teacherId)).assessments).toEqual([]);
    const replacement = await assessmentService.read(replacementId); const student = await assessmentService.read(studentId);
    expect(replacement.assessments[0].attempts[0].teacherId).toBe(replacementId); expect(student.assessments[0].supervisorId).toBe(replacementId);
    for (const view of [replacement, student]) expect(view).not.toHaveProperty("manageableSupervisorAssessmentIds");
    expect(JSON.stringify(student)).not.toContain("PRIVATE SUPERVISOR REASON");
    const persisted = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    expect(persisted.history[0]).toEqual(original.history[0]); expect(persisted.history.at(-1)).toMatchObject({ action: "supervisor-changed", previousSupervisorId: teacherId });
    const config = await assessmentService.read(actorId);
    const history = await assessmentService.readAttemptHistory({ ...commandContext(config, actorId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id, page: 1 });
    expect(history.items[0]).toMatchObject({ action: "supervisor-changed", previousSupervisorId: teacherId, assignment: { teacherId: replacementId } });
  });
  it.each([true, false])("serializes replacement and the first result (replacement first: %s)", async (replacementFirst) => {
    const { replacementId, snapshot, assessment } = await setup(); const teacher = await assessmentService.read(teacherId);
    const change: AssessmentCommand = { ...commandContext(snapshot, actorId), type: "change-supervisor", assessmentId: assessment.id, teacherId: replacementId, reason: "Замена руководителя" };
    const save: AssessmentCommand = { ...commandContext(teacher, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, results: [{ studentId, outcome: { status: "graded", grade: 4 } }] };
    write.mockClear(); const results = await Promise.allSettled((replacementFirst ? [change, save] : [save, change]).map((command) => assessmentService.execute(command)));
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]); expect(write).toHaveBeenCalledOnce();
    const current = await assessmentService.read(actorId);
    expect(current.assessments[0].supervisorId).toBe(replacementFirst ? replacementId : teacherId);
    expect(current.manageableSupervisorAssessmentIds).toEqual(replacementFirst ? [assessment.id] : []);
    expect(current.assessments[0].attempts[0].results[0].outcome).toEqual(replacementFirst ? null : { status: "graded", grade: 4 });
  });
});

describe("published assessment correction persistence", () => {
  it("keeps the student's published grade until correction publication and exposes drafts only to staff", async () => {
    const assessment = await publishedStatement(); const attemptId = assessment.attempts[0].id;
    const original = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    let snapshot = await assessmentService.read(actorId);
    await assessmentService.execute({ ...commandContext(snapshot, actorId), type: "open-correction", assessmentId: assessment.id, attemptId, reason: "PRIVATE CORRECTION" });
    let teacher = await assessmentService.read(teacherId); const correctionId = teacher.corrections![0].id;
    await assessmentService.execute({ ...commandContext(teacher, teacherId), type: "save-correction", assessmentId: assessment.id, attemptId, correctionId, results: [{ studentId, outcome: { status: "graded", grade: 2 } }] });
    const before = await assessmentService.read(studentId);
    expect(before.assessments[0].attempts[0].results[0].outcome).toEqual({ status: "graded", grade: 5 });
    expect(before).not.toHaveProperty("corrections"); expect(before).not.toHaveProperty("correctionPublications"); expect(JSON.stringify(before)).not.toContain("PRIVATE CORRECTION");
    teacher = await assessmentService.read(teacherId);
    await assessmentService.execute({ ...commandContext(teacher, teacherId), type: "publish-correction", assessmentId: assessment.id, attemptId, correctionId });
    snapshot = await assessmentService.read(actorId);
    expect(snapshot.corrections).toEqual([]); expect(snapshot.correctionPublications![0]).toMatchObject({ version: 2, state: "published" }); expect(snapshot.correctionPublications![0]).not.toHaveProperty("results");
    expect((await assessmentService.read(studentId)).assessments[0].attempts[0].results[0].outcome).toEqual({ status: "graded", grade: 2 });
    const current = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    expect(current.assessments).toEqual(original.assessments); expect(current.history).toEqual(original.history);
    const latest = await assessmentService.exportStatement({ ...commandContext(snapshot, actorId), assessmentId: assessment.id, attemptId });
    const first = await assessmentService.exportStatement({ ...commandContext(snapshot, actorId), assessmentId: assessment.id, attemptId, version: 1 });
    expect(latest.filename).toContain("-v2.csv"); expect(first.filename).toContain("-v1.csv"); expect(latest.csv).not.toBe(first.csv);
  });
  it("serializes concurrent correction permissions without opening two drafts", async () => {
    const assessment = await publishedStatement(); const snapshot = await assessmentService.read(actorId);
    const command: AssessmentCommand = { ...commandContext(snapshot, actorId), type: "open-correction", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, reason: "Проверка результата" };
    write.mockClear();
    const result = await Promise.allSettled([assessmentService.execute(command), assessmentService.execute(command)]);
    expect(result.map((entry) => entry.status)).toEqual(["fulfilled", "rejected"]); expect(write).toHaveBeenCalledOnce();
    expect((await assessmentService.read(actorId)).corrections).toHaveLength(1);
  });
  it.each([true, false])("serializes correction publication and a concurrent save (publication first: %s)", async (publicationFirst) => {
    const assessment = await publishedStatement(); const attemptId = assessment.attempts[0].id;
    const config = await assessmentService.read(actorId);
    await assessmentService.execute({ ...commandContext(config, actorId), type: "open-correction", assessmentId: assessment.id, attemptId, reason: "Проверка результата" });
    let teacher = await assessmentService.read(teacherId); const correctionId = teacher.corrections![0].id;
    await assessmentService.execute({ ...commandContext(teacher, teacherId), type: "save-correction", assessmentId: assessment.id, attemptId, correctionId, results: [{ studentId, outcome: { status: "graded", grade: 2 } }] });
    teacher = await assessmentService.read(teacherId);
    const common = { ...commandContext(teacher, teacherId), assessmentId: assessment.id, attemptId, correctionId };
    const publish: AssessmentCommand = { ...common, type: "publish-correction" };
    const save: AssessmentCommand = { ...common, type: "save-correction", results: [{ studentId, outcome: { status: "graded", grade: 4 } }] };
    write.mockClear(); const result = await Promise.allSettled((publicationFirst ? [publish, save] : [save, publish]).map((command) => assessmentService.execute(command)));
    expect(result.map((entry) => entry.status)).toEqual(["fulfilled", "rejected"]); expect(write).toHaveBeenCalledOnce();
    expect((await assessmentService.read(studentId)).assessments[0].attempts[0].results[0].outcome).toEqual({ status: "graded", grade: publicationFirst ? 2 : 5 });
  });
});

describe("assessment assignment history service", () => {
  it("returns only an assignment page without writes, events, results or a full audit in any role snapshot", async () => {
    const assessment = await publishedStatement();
    const snapshot = await assessmentService.read(actorId);
    const before = new Map(values); write.mockClear();
    const listener = vi.fn(); window.addEventListener(ASSESSMENTS_CHANGE_EVENT, listener);
    const page = await assessmentService.readAttemptHistory({ ...commandContext(snapshot, actorId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id, page: 1 });
    expect(page).toMatchObject({ revision: snapshot.revision, total: 1, page: 1, pages: 1 });
    expect(page.items[0].action).toBe("created"); expect(page.items[0]).not.toHaveProperty("results"); expect(page.items[0].assignment).not.toHaveProperty("studentIds");
    for (const id of [actorId, teacherId, studentId]) expect(await assessmentService.read(id)).not.toHaveProperty("history");
    page.items[0].assignment!.memberIds.push("not-persisted");
    expect(write).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled(); expect(values).toEqual(before);
  });
  it.each([teacherId, studentId])("rejects direct history reads by %s", async (id) => {
    const assessment = await create(); const snapshot = await assessmentService.read(id);
    await expect(assessmentService.readAttemptHistory({ ...commandContext(snapshot, id), assessmentId: assessment.id, attemptId: assessment.attempts[0].id, page: 1 })).rejects.toThrow("только настройщику");
  });
  it("rereads revisions and the actor status before returning a page", async () => {
    const assessment = await create(); const snapshot = await assessmentService.read(actorId);
    const request = { ...commandContext(snapshot, actorId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id, page: 1 };
    await assessmentService.execute({ ...commandContext(snapshot, actorId), type: "update-attempt", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, draft: { ...assessmentAttemptAssignment(assessment.attempts[0]), room: "202" } });
    await expect(assessmentService.readAttemptHistory(request)).rejects.toThrow("изменились");
    const accounts = createInitialAccountsDocument();
    const actor = accounts.accounts.find((account) => account.id === actorId)!;
    accounts.accounts.push({ ...actor, id: "other-configurator", login: "other.configurator" });
    actor.status = "blocked";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    await expect(assessmentService.readAttemptHistory(request)).rejects.toThrow("действующей");
  });
  it("does not repair a damaged source or recreate a missing attempt during a history read", async () => {
    const assessment = await create(); const snapshot = await assessmentService.read(actorId);
    const request = { ...commandContext(snapshot, actorId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id, page: 1 };
    values.set(ASSESSMENTS_STORAGE_KEY, "{damaged"); write.mockClear();
    await expect(assessmentService.readAttemptHistory(request)).rejects.toThrow();
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe("{damaged"); expect(write).not.toHaveBeenCalled();
    values.delete(ASSESSMENTS_STORAGE_KEY);
    await expect(assessmentService.readAttemptHistory({ ...request, expectedRevision: 0 })).rejects.toThrow("недоступна");
    expect(values.has(ASSESSMENTS_STORAGE_KEY)).toBe(false); expect(write).not.toHaveBeenCalled();
  });
});

describe("ordinary assessment demo import", () => {
  it("generates real Unicode titles and periods without middle dots", async () => {
    await appendAssessmentDemoRecords();
    const saved = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    for (const item of saved.assessments) {
      expect(item.title).toBe(`${ASSESSMENT_KIND_LABELS[item.kind]} — ${item.id.endsWith(":published") ? "опубликованный пример" : "черновик"}`);
      expect(item.title).not.toContain("·");
      expect(item.period).toBe("Демонстрационный учебный период");
    }
    expect(saved.assessments[0].title).toBe("Экзамен — опубликованный пример");
  });
  it("repairs only exact saved demo text on read, preserving history and custom fields through the next write", async () => {
    await create();
    await appendAssessmentDemoRecords();
    const saved = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    const brokenPeriod = "Р”РµРјРѕРЅСЃС‚СЂР°С†РёРѕРЅРЅС‹Р№ СѓС‡РµР±РЅС‹Р№ РїРµСЂРёРѕРґ";
    const brokenTitle = (label: string, published: boolean) => `${label} В· ${published ? "РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹Р№ РїСЂРёРјРµСЂ" : "С‡РµСЂРЅРѕРІРёРє"}`;
    for (const item of saved.assessments) {
      item.title = brokenTitle(ASSESSMENT_KIND_LABELS[item.kind], item.id.endsWith(":published"));
      if (!item.academicPeriod) item.period = brokenPeriod;
    }
    const customTitle = saved.assessments.find((item) => item.id === "demo-assessment-v1:pass:draft")!;
    customTitle.title = "Мой зачёт · изменённый черновик";
    const customPeriod = saved.assessments.find((item) => item.id === "demo-assessment-v1:exam:draft")!;
    customPeriod.period = "Мой учебный период";
    const raw = JSON.stringify(saved);
    values.set(ASSESSMENTS_STORAGE_KEY, raw);
    write.mockClear();
    const repaired = await assessmentService.read(actorId);
    const expected = saved.assessments.map((item, index) => index === 0 ? item : {
      ...item,
      title: item.id === customTitle.id ? customTitle.title : `${ASSESSMENT_KIND_LABELS[item.kind]} — ${item.id.endsWith(":published") ? "опубликованный пример" : "черновик"}`,
      period: item.id === customPeriod.id ? customPeriod.period : "Демонстрационный учебный период",
    });
    expect(repaired.assessments).toEqual(expected);
    expect(repaired.revision).toBe(saved.revision);
    expect((await assessmentService.read(actorId)).assessments).toEqual(expected);
    expect(await appendAssessmentDemoRecords()).toEqual({ assessments: 0, assessmentAttempts: 0 });
    expect(write).not.toHaveBeenCalled();
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(raw);
    await assessmentService.execute({ ...commandContext(repaired, actorId), type: "update-record-book", assessmentId: customTitle.id, recordBook: { semester: 8, hours: 99, category: "elective" } });
    const persisted = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    expect(persisted.history.slice(0, -1)).toEqual(saved.history);
    expect(persisted.revision).toBe(saved.revision + 1);
    expect(persisted.assessments).toEqual(expected.map((item) => item.id === customTitle.id ? { ...item, recordBook: { semester: 8, hours: 99, category: "elective" } } : item));
  });
  it("adds every kind, published results, editable drafts, retakes and a real commission", async () => {
    expect(await appendAssessmentDemoRecords()).toEqual({ assessments: 12, assessmentAttempts: 18 });
    const teacher = await assessmentService.read(teacherId);
    expect(new Set(teacher.assessments.map((item) => item.kind)).size).toBe(6);
    const commission = teacher.assessments.flatMap((item) => item.attempts).find((item) => item.kind === "commission")!;
    const accounts = JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!);
    expect(accounts.accounts.some((item: { id: string }) => item.id === commission.memberIds[0])).toBe(true);
    const student = await assessmentService.read(studentId);
    expect(student.assessments.flatMap((item) => item.attempts).every((item) => item.state === "published" || item.results.length === 0)).toBe(true);
    const draft = teacher.assessments.find((item) => item.kind === "coursework" && item.attempts[0].state === "draft")!;
    await assessmentService.execute({ ...commandContext(teacher, teacherId), type: "save-results", assessmentId: draft.id, attemptId: draft.attempts[0].id, results: [{ studentId, outcome: { status: "graded", grade: 5 } }] });
    const before = new Map(values);
    write.mockClear();
    expect(await appendAssessmentDemoRecords()).toEqual({ assessments: 0, assessmentAttempts: 0 });
    expect(values).toEqual(before);
    expect(write).not.toHaveBeenCalled();
  });
  it("preserves existing assessments and serializes concurrent imports", async () => {
    const original = await create();
    const results = await Promise.all([appendAssessmentDemoRecords(), appendAssessmentDemoRecords()]);
    expect(results.map((item) => item.assessments)).toEqual([12, 0]);
    expect((await assessmentService.read(actorId)).assessments[0]).toEqual(original);
  });
  it.each([ASSESSMENTS_STORAGE_KEY, ACCOUNTS_STORAGE_KEY, GROUP_CATALOG_STORAGE_KEY, SUBJECT_CATALOG_STORAGE_KEY])("does not overwrite corrupt %s", async (key) => {
    values.set(key, "broken bytes");
    await expect(appendAssessmentDemoRecords()).rejects.toThrow();
    expect(values.get(key)).toBe("broken bytes");
    expect(write).not.toHaveBeenCalled();
  });
  it("preserves blocked demo accounts rather than restoring them", async () => {
    const accounts = createInitialAccountsDocument();
    accounts.accounts.find((item) => item.id === teacherId)!.status = "blocked";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    await expect(appendAssessmentDemoRecords()).rejects.toThrow("Демонстрационные участники, назначения или группа недоступны. Существующие аттестации сохранены.");
    expect(write).not.toHaveBeenCalled();
  });
  it("retries an assessment quota failure without duplicating the commission account", async () => {
    write.mockImplementation((key: string, value: string) => { if (key === ASSESSMENTS_STORAGE_KEY) throw new Error("quota"); values.set(key, value); });
    await expect(appendAssessmentDemoRecords()).rejects.toThrow("quota");
    const accounts = values.get(ACCOUNTS_STORAGE_KEY);
    write.mockImplementation((key: string, value: string) => { values.set(key, value); });
    expect((await appendAssessmentDemoRecords()).assessments).toBe(12);
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(accounts);
  });
});

describe("assessment persistence boundary", () => {
  it("reads legacy documents without writing and persists record book metadata through the revisioned command", async () => {
    const current = await create();
    const persisted = JSON.parse(values.get(ASSESSMENTS_STORAGE_KEY)!);
    persisted.version = 1;
    delete persisted.corrections; delete persisted.correctionHistory;
    for (const item of persisted.assessments) { delete item.recordBook; delete item.academicPeriod; }
    for (const item of persisted.history) { delete item.recordBook; delete item.assignment; delete item.academicPeriod; }
    const legacyRaw = JSON.stringify(persisted);
    values.set(ASSESSMENTS_STORAGE_KEY, legacyRaw); write.mockClear();
    const migrated = await assessmentService.read(actorId);
    expect(migrated.assessments[0].recordBook).toBeNull();
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(legacyRaw); expect(write).not.toHaveBeenCalled();
    await assessmentService.execute({ ...commandContext(migrated, actorId), type: "update-record-book", assessmentId: current.id, recordBook: { semester: 1, hours: 72, category: "elective" } });
    const saved = JSON.parse(values.get(ASSESSMENTS_STORAGE_KEY)!);
    expect(saved.version).toBe(5); expect(saved.assessments[0].attempts).toEqual(current.attempts);
    expect(saved.history.at(-1)).toMatchObject({ action: "record-book-updated", recordBook: { semester: 1, hours: 72, category: "elective" } });
  });
  it("starts empty without writing invented assessments or other documents", async () => {
    const snapshot = await assessmentService.read(actorId);
    expect(snapshot).toMatchObject({ revision: 0, assessments: [], students: [{ studentId }] });
    expect(snapshot.teachers).toEqual([{ id: teacherId, name: "Елена Волкова" }]);
    expect(write).not.toHaveBeenCalled();
  });

  it("persists one valid document and notifies only after the write", async () => {
    const listener = vi.fn(() => expect(values.has(ASSESSMENTS_STORAGE_KEY)).toBe(true));
    window.addEventListener(ASSESSMENTS_CHANGE_EVENT, listener);
    const assessment = await create();
    expect(assessment).toMatchObject({ title: "Экзамен по теории вероятностей", supervisorId: null, roster: [{ studentId }], attempts: [{ state: "draft", startsAt: "12:00", results: [{ studentId, outcome: null }] }] });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0][0]).toBe(ASSESSMENTS_STORAGE_KEY);
    expect(JSON.parse(values.get(ASSESSMENTS_STORAGE_KEY)!)).toMatchObject({ revision: 1, history: [{ action: "created", actorId }] });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("blocks result writes before the exact Moscow start time and allows the boundary itself", async () => {
    vi.setSystemTime(new Date("2026-11-06T08:59:59.999Z"));
    const assessment = await create();
    const teacher = await assessmentService.read(teacherId);
    const input: AssessmentCommand = { ...commandContext(teacher, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, results: [{ studentId, outcome: { status: "graded", grade: 4 } }] };
    const original = values.get(ASSESSMENTS_STORAGE_KEY);
    write.mockClear();
    await expect(assessmentService.execute(input)).rejects.toThrow("назначенных даты и времени");
    expect(write).not.toHaveBeenCalled();
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(original);
    const earlyPublish: AssessmentCommand = { ...commandContext(teacher, teacherId), type: "publish", assessmentId: assessment.id, attemptId: assessment.attempts[0].id };
    await expect(assessmentService.execute(earlyPublish)).rejects.toThrow("назначенных даты и времени");
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(original);
    vi.setSystemTime(new Date("2026-11-06T09:00:00.000Z"));
    await assessmentService.execute(input);
    const saved = await assessmentService.read(teacherId);
    expect(saved.assessments[0].attempts[0].results).toEqual(input.results);
    const publish: AssessmentCommand = { ...commandContext(saved, teacherId), type: "publish", assessmentId: assessment.id, attemptId: assessment.attempts[0].id };
    await assessmentService.execute(publish);
    expect((await assessmentService.read(studentId)).assessments[0].attempts[0].state).toBe("published");
  });

  it.each([ASSESSMENTS_STORAGE_KEY, ACCOUNTS_STORAGE_KEY, GROUP_CATALOG_STORAGE_KEY, SUBJECT_CATALOG_STORAGE_KEY])("preserves corrupt bytes and blocks all work when %s is corrupt", async (key) => {
    values.set(key, "damaged original bytes");
    await expect(assessmentService.read(actorId)).rejects.toThrow();
    await expect(assessmentService.execute(createCommand())).rejects.toThrow();
    expect(values.get(key)).toBe("damaged original bytes");
    expect(write).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it.each(["accounts", "groups", "subjects", "actor", "assessments"])("rejects a command after the %s revision changes", async (dependency) => {
    const input = createCommand();
    if (dependency === "accounts" || dependency === "actor") {
      const document = createInitialAccountsDocument();
      if (dependency === "accounts") document.revision++;
      else document.accounts.find((account) => account.id === actorId)!.revision++;
      values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(document));
    } else if (dependency === "groups") values.set(GROUP_CATALOG_STORAGE_KEY, JSON.stringify({ ...emptyGroupCatalog(), revision: 1 }));
    else if (dependency === "subjects") values.set(SUBJECT_CATALOG_STORAGE_KEY, JSON.stringify({ ...createInitialSubjectCatalogDocument(), revision: 1 }));
    else await create();
    const before = values.get(ASSESSMENTS_STORAGE_KEY);
    write.mockClear();
    await expect(assessmentService.execute(input)).rejects.toThrow();
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(before);
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a blocked or missing actor before returning catalogue or roster data", async () => {
    const document = createInitialAccountsDocument();
    document.accounts.push({ ...document.accounts[2], id: "configurator-backup", login: "backup.configurator" });
    document.accounts.find((account) => account.id === actorId)!.status = "blocked";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(document));
    await expect(assessmentService.read(actorId)).rejects.toThrow("действующей");
    await expect(assessmentService.read("missing")).rejects.toThrow("действующей");
    await expect(assessmentService.execute(createCommand())).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not report success or dispatch an event when storage quota rejects the write", async () => {
    const listener = vi.fn();
    window.addEventListener(ASSESSMENTS_CHANGE_EVENT, listener);
    write.mockImplementation(() => { throw new Error("QuotaExceededError"); });
    await expect(assessmentService.execute(createCommand())).rejects.toThrow("изменения не сохранены");
    expect(values.has(ASSESSMENTS_STORAGE_KEY)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("allows only one concurrent command with the same expected revision", async () => {
    const outcomes = await Promise.allSettled([assessmentService.execute(createCommand()), assessmentService.execute(createCommand())]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(write).toHaveBeenCalledOnce();
    expect((await assessmentService.read(actorId)).revision).toBe(1);
  });

  it("copies nested command data before waiting for a preceding administrative write", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const earlier = executeAdministrationWrite(() => gate);
    const input = createCommand();
    const pending = assessmentService.execute(input);
    if (input.type !== "create") throw new Error("Expected create command");
    input.draft.title = "Поздняя правка формы";
    input.draft.attempt.teacherId = "wrong-teacher";
    input.draft.attempt.studentIds.length = 0;
    release();
    await earlier;
    await pending;
    const assessment = (await assessmentService.read(actorId)).assessments[0];
    expect(assessment.title).toBe("Экзамен по теории вероятностей");
    expect(assessment.attempts[0].teacherId).toBe(teacherId);
    expect(assessment.attempts[0].studentIds).toEqual([studentId]);
  });
});

describe("assessment management persistence", () => {
  it("exposes audited management only to the configurator and hides private cancellation details from students", async () => {
    const assessment = await create(); const attempt = assessment.attempts[0];
    const config = await assessmentService.read(actorId);
    expect(config.manageableAttemptIds).toEqual([attempt.id]); expect(config).not.toHaveProperty("history");
    const historyRequest = { ...commandContext(config, actorId), assessmentId: assessment.id, attemptId: attempt.id, page: 1 };
    expect((await assessmentService.readAttemptHistory(historyRequest)).items[0].assignment).toMatchObject({ teacherId });
    await assessmentService.execute({ ...commandContext(config, actorId), type: "cancel-attempt", assessmentId: assessment.id, attemptId: attempt.id, reason: "PRIVATE CANCELLATION REASON" });
    const student = await assessmentService.read(studentId); const teacher = await assessmentService.read(teacherId); const current = await assessmentService.read(actorId);
    expect(student.assessments[0].attempts[0]).toMatchObject({ id: attempt.id, state: "cancelled", results: [] });
    expect(JSON.stringify(student)).not.toContain("PRIVATE CANCELLATION");
    for (const view of [student, teacher]) { expect(view).not.toHaveProperty("history"); expect(view).not.toHaveProperty("manageableAttemptIds"); }
    expect((await assessmentService.readAttemptHistory({ ...historyRequest, ...commandContext(current, actorId) })).items[0]).toMatchObject({ action: "attempt-cancelled", reason: "PRIVATE CANCELLATION REASON" });
    expect(current.manageableAttemptIds).toEqual([]);
  });
  it("keeps management closed in the read model after a saved grade is cleared", async () => {
    const assessment = await create(); const attempt = assessment.attempts[0];
    for (const outcome of [{ status: "graded" as const, grade: 2 as const }, null]) {
      const snapshot = await assessmentService.read(teacherId);
      await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: attempt.id, results: [{ studentId, outcome }] });
    }
    const config = await assessmentService.read(actorId); const before = values.get(ASSESSMENTS_STORAGE_KEY); write.mockClear();
    expect(config.manageableAttemptIds).toEqual([]);
    await expect(assessmentService.execute({ ...commandContext(config, actorId), type: "cancel-attempt", assessmentId: assessment.id, attemptId: attempt.id, reason: "Перенос" })).rejects.toThrow("первого сохранённого");
    expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(before); expect(write).not.toHaveBeenCalled();
  });
  it.each([["cancel-attempt", true], ["cancel-attempt", false], ["update-attempt", true], ["update-attempt", false]] as const)("serializes %s and the first result (result wins: %s) without losing either source", async (type, resultFirst) => {
    const assessment = await create(); const attempt = assessment.attempts[0];
    const config = await assessmentService.read(actorId); const teacher = await assessmentService.read(teacherId);
    const save: AssessmentCommand = { ...commandContext(teacher, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: attempt.id, results: [{ studentId, outcome: { status: "graded", grade: 2 } }] };
    const common = { ...commandContext(config, actorId), assessmentId: assessment.id, attemptId: attempt.id };
    const manage: AssessmentCommand = type === "cancel-attempt" ? { ...common, type, reason: "Перенос" } : { ...common, type, draft: { ...assessmentAttemptAssignment(attempt), room: "202" } };
    write.mockClear();
    const ordered = resultFirst ? [save, manage] : [manage, save];
    const outcomes = await Promise.allSettled(ordered.map((command) => assessmentService.execute(command)));
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "rejected"]); expect(write).toHaveBeenCalledOnce();
    const current = await assessmentService.read(actorId); const persisted = current.assessments[0].attempts[0];
    expect(current.revision).toBe(config.revision + 1);
    expect(persisted.results[0].outcome).toEqual(resultFirst ? { status: "graded", grade: 2 } : null);
    expect(persisted.state).toBe(!resultFirst && type === "cancel-attempt" ? "cancelled" : "draft");
    expect(decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!).history.at(-1)?.action).toBe(resultFirst ? "results-saved" : type === "cancel-attempt" ? "attempt-cancelled" : "attempt-updated");
  });
});

describe("assessment role-safe read models", () => {
  it("keeps all prior attempts when a failed student passes an individual commission after a retake", async () => {
    const accounts = createInitialAccountsDocument();
    const peerId = "student-peer";
    accounts.accounts.push({ ...accounts.accounts[1], id: peerId, login: "peer.student", name: "Другой Студент" });
    for (const id of ["commission-chair", "commission-member"]) accounts.accounts.push({ ...accounts.accounts[0], id, login: id, name: id });
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    const input = createCommand();
    if (input.type !== "create") throw new Error("Expected create command");
    input.draft.attempt.studentIds.push(peerId);
    await assessmentService.execute(input);
    const initial = (await assessmentService.read(actorId)).assessments[0];
    const saveAndPublish = async (attemptId: string, results: Extract<AssessmentCommand, { type: "save-results" }>["results"]) => {
      let snapshot = await assessmentService.read(teacherId);
      await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "save-results", assessmentId: initial.id, attemptId, results });
      snapshot = await assessmentService.read(teacherId);
      await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "publish", assessmentId: initial.id, attemptId });
    };
    await saveAndPublish(initial.attempts[0].id, [{ studentId, outcome: { status: "graded", grade: 2 } }, { studentId: peerId, outcome: { status: "graded", grade: 4 } }]);
    let config = await assessmentService.read(actorId);
    await assessmentService.execute({ ...commandContext(config, actorId), type: "add-attempt", assessmentId: initial.id, kind: "retake", draft: { room: "A-101", date: "2026-11-06", startsAt: "12:00", teacherId, chairId: null, memberIds: [], studentIds: [studentId] } });
    config = await assessmentService.read(actorId);
    await saveAndPublish(config.assessments[0].attempts[1].id, [{ studentId, outcome: { status: "absent" } }]);
    config = await assessmentService.read(actorId);
    const beforeCommission = structuredClone(config.assessments[0].attempts);
    await assessmentService.execute({ ...commandContext(config, actorId), type: "add-attempt", assessmentId: initial.id, kind: "commission", draft: { room: "A-102", date: "2026-11-06", startsAt: "12:00", teacherId, chairId: "commission-chair", memberIds: ["commission-member"], studentIds: [studentId] } });
    config = await assessmentService.read(actorId);
    await saveAndPublish(config.assessments[0].attempts[2].id, [{ studentId, outcome: { status: "graded", grade: 5 } }]);
    const final = (await assessmentService.read(actorId)).assessments[0];
    expect(final.attempts.slice(0, 2)).toEqual(beforeCommission);
    expect(final.attempts[2]).toMatchObject({ kind: "commission", chairId: "commission-chair", memberIds: ["commission-member"], state: "published", studentIds: [studentId] });
    const student = await assessmentService.read(studentId);
    expect(student.assessments[0].attempts.map((attempt) => attempt.results[0].outcome)).toEqual([{ status: "graded", grade: 2 }, { status: "absent" }, { status: "graded", grade: 5 }]);
    expect(student.teachers.map((teacher) => teacher.id)).toEqual([teacherId, "commission-chair", "commission-member"]);
    const peer = await assessmentService.read(peerId);
    expect(peer.assessments[0].attempts).toHaveLength(1);
    expect(peer.teachers).toEqual([{ id: teacherId, name: "Елена Волкова" }]);
    expect(JSON.stringify(student)).not.toContain(peerId);
    expect(JSON.parse(values.get(ASSESSMENTS_STORAGE_KEY)!).history).toHaveLength(9);
  });

  it("does not treat a blocked login as expulsion from a student group", async () => {
    const document = createInitialAccountsDocument();
    document.accounts.find((account) => account.id === studentId)!.status = "blocked";
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(document));
    expect((await assessmentService.read(actorId)).students.map((student) => student.studentId)).toContain(studentId);
  });

  it("limits student records to published own results and teacher records to assigned attempts", async () => {
    const accounts = createInitialAccountsDocument();
    const peerId = "student-peer";
    accounts.accounts.push({ ...accounts.accounts[1], id: peerId, login: "peer.student", name: "Закрытое Имя Соседа" });
    accounts.accounts.push({ ...accounts.accounts[0], id: "unrelated-teacher", login: "other.teacher", name: "Другой Преподаватель" });
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    const input = createCommand();
    if (input.type !== "create") throw new Error("Expected create command");
    input.draft.attempt.studentIds.push(peerId);
    await assessmentService.execute(input);
    const config = await assessmentService.read(actorId);
    const assessment = config.assessments[0];
    const assigned = await assessmentService.read(teacherId);
    expect(assigned.students).toEqual([]);
    expect(assigned.assessments[0].roster).toHaveLength(2);
    expect(assigned.teachers.map((teacher) => teacher.id)).toEqual([teacherId]);
    const unrelated = await assessmentService.read("unrelated-teacher");
    expect(unrelated).toMatchObject({ assessments: [], students: [], teachers: [], subjects: [], groups: [] });
    const draftStudent = await assessmentService.read(studentId);
    expect(JSON.stringify(draftStudent)).not.toContain("Закрытое Имя Соседа");
    expect(draftStudent.students).toEqual([]);
    expect(draftStudent.assessments.every((entry) => entry.attempts.every((attempt) => attempt.state === "published" || attempt.results.length === 0))).toBe(true);
    await assessmentService.execute({ ...commandContext(assigned, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, results: [{ studentId, outcome: { status: "graded", grade: 5 } }, { studentId: peerId, outcome: { status: "graded", grade: 2 } }] });
    const updated = await assessmentService.read(teacherId);
    await assessmentService.execute({ ...commandContext(updated, teacherId), type: "publish", assessmentId: assessment.id, attemptId: assessment.attempts[0].id });
    const own = await assessmentService.read(studentId);
    expect(own.assessments[0].roster.map((student) => student.studentId)).toEqual([studentId]);
    expect(own.assessments[0].attempts[0].results).toEqual([{ studentId, outcome: { status: "graded", grade: 5 } }]);
    expect(own.students).toEqual([]);
    expect(JSON.stringify(own)).not.toContain(peerId);
    expect(JSON.stringify(own)).not.toContain("Закрытое Имя Соседа");
  });
});

describe("assessment change subscriptions", () => {
  it("refreshes own and dependency writes, cross-tab changes, focus and visible transitions, then detaches", () => {
    const listener = vi.fn();
    const unsubscribe = assessmentService.subscribe(listener);
    for (const type of [ASSESSMENTS_CHANGE_EVENT, GROUP_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_CHANGE_EVENT, "bi-university-accounts-change", "focus"]) window.dispatchEvent(new Event(type));
    for (const key of [ASSESSMENTS_STORAGE_KEY, GROUP_CATALOG_STORAGE_KEY, SUBJECT_CATALOG_STORAGE_KEY, ACCOUNTS_STORAGE_KEY, null]) window.dispatchEvent(Object.assign(new Event("storage"), { key }));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenCalledTimes(11);
    window.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated" }));
    Object.assign(document, { visibilityState: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenCalledTimes(11);
    unsubscribe();
    for (const type of [ASSESSMENTS_CHANGE_EVENT, GROUP_CATALOG_CHANGE_EVENT, SUBJECT_CATALOG_CHANGE_EVENT, "bi-university-accounts-change", "focus"]) window.dispatchEvent(new Event(type));
    window.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
    Object.assign(document, { visibilityState: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenCalledTimes(11);
  });
});

describe("assessment period persistence", () => {
  it("offers the shared calendar only for configuration and does not seed missing periods", async () => {
    values.delete(ACADEMIC_PERIODS_STORAGE_KEY);
    const snapshot = await assessmentService.read(actorId);
    expect(snapshot.academicPeriods).toEqual({ revision: 0, years: [], terms: [] }); expect(write).not.toHaveBeenCalled();
    expect((await assessmentService.read(teacherId)).academicPeriods).toBeUndefined(); expect((await assessmentService.read(studentId)).academicPeriods).toBeUndefined();
    expect(values.has(ACADEMIC_PERIODS_STORAGE_KEY)).toBe(false);
  });
  it("requires an explicit term even when the typed legacy period matches a saved name", async () => {
    const input = createCommand(); if (input.type !== "create") throw new Error("Expected creation"); delete input.draft.academicPeriod;
    await expect(assessmentService.execute(input)).rejects.toThrow("Выберите учебный год"); expect(values.has(ASSESSMENTS_STORAGE_KEY)).toBe(false); expect(write).not.toHaveBeenCalled();
  });
  it("saves current IDs, dates and revisions rather than accepting the client's period label", async () => {
    const input = createCommand(); if (input.type !== "create") throw new Error("Expected creation"); input.draft.period = "Client-controlled label";
    await assessmentService.execute(input); const state = decodeAssessmentDocument(values.get(ASSESSMENTS_STORAGE_KEY)!);
    expect(state.version).toBe(6); expect(state.assessments[0].period).toBe("2026/2027 · осенний семестр"); expect(state.assessments[0].academicPeriod?.term.id).toBe("term-autumn"); expect(state.history[0].academicPeriod).toEqual(state.assessments[0].academicPeriod);
  });
  it("rechecks the calendar revision inside the shared write queue", async () => {
    const rename = academicPeriodsService.execute({ actorId, actorRevision: 1, expectedRevision: 2, type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { name: "Новый осенний семестр", startsOn: "2026-09-01", endsOn: "2027-01-31" } });
    const results = await Promise.allSettled([rename, assessmentService.execute(createCommand())]);
    expect(results.map(row => row.status)).toEqual(["fulfilled", "rejected"]); expect(values.has(ASSESSMENTS_STORAGE_KEY)).toBe(false); expect(write).toHaveBeenCalledTimes(1);
  });
  it("keeps existing statements unchanged after a calendar rename", async () => {
    const assessment = await create(), raw = values.get(ASSESSMENTS_STORAGE_KEY);
    await academicPeriodsService.execute({ actorId, actorRevision: 1, expectedRevision: 2, type: "update-term", termId: "term-autumn", entityRevision: 1, draft: { name: "Переименованный семестр", startsOn: "2026-09-01", endsOn: "2027-02-10" } });
    const current = await assessmentService.read(actorId); expect(current.assessments[0]).toEqual(assessment); expect(current.academicPeriods?.terms[0].name).toBe("Переименованный семестр"); expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(raw);
  });
  it("isolates a damaged calendar from existing results and exports", async () => {
    const assessment = await create(); values.set(ACADEMIC_PERIODS_STORAGE_KEY, "damaged calendar");
    let snapshot = await assessmentService.read(teacherId);
    await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "save-results", assessmentId: assessment.id, attemptId: assessment.attempts[0].id, results: [{ studentId, outcome: { status: "graded", grade: 5 } }] });
    snapshot = await assessmentService.read(teacherId);
    await assessmentService.execute({ ...commandContext(snapshot, teacherId), type: "publish", assessmentId: assessment.id, attemptId: assessment.attempts[0].id });
    snapshot = await assessmentService.read(teacherId);
    expect((await assessmentService.exportStatement({ ...commandContext(snapshot, teacherId), assessmentId: assessment.id, attemptId: assessment.attempts[0].id })).csv).toContain("term-autumn");
    const admin = await assessmentService.read(actorId); expect(admin.academicPeriods?.error).toBeTruthy(); expect(admin.assessments).toHaveLength(1);
    const before = values.get(ASSESSMENTS_STORAGE_KEY); await expect(assessmentService.execute({ ...createCommand(), ...commandContext(admin, actorId) })).rejects.toThrow(); expect(values.get(ASSESSMENTS_STORAGE_KEY)).toBe(before);
  });
  it("notifies calendar changes in this tab and other tabs without duplicating storage.clear", () => {
    const listener = vi.fn(), stop = assessmentService.subscribe(listener);
    window.dispatchEvent(new Event(ACADEMIC_PERIODS_CHANGE_EVENT)); const event = new Event("storage"); Object.assign(event, { key: ACADEMIC_PERIODS_STORAGE_KEY }); window.dispatchEvent(event);
    const cleared = new Event("storage"); Object.assign(cleared, { key: null }); window.dispatchEvent(cleared); expect(listener).toHaveBeenCalledTimes(3);
    stop(); window.dispatchEvent(new Event(ACADEMIC_PERIODS_CHANGE_EVENT)); expect(listener).toHaveBeenCalledTimes(3);
  });
});
