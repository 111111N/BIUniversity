import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_STORAGE_KEY, accountService, createInitialAccountsDocument, readAccountsState, registerTeachingAssignmentGuard } from "./accountStore";
import { ACADEMIC_GROUPS, ACADEMIC_SUBJECTS, DEMO_SUBJECTS, SUBJECTS, SUBJECT_GROUP_OFFERINGS, getAcademicSubjectDefinition, getSubjectGroups, refreshAcademicCatalog } from "./academicCatalog";
import { SUBJECT_CATALOG_STORAGE_KEY, readSubjectCatalogState, subjectCatalogService, subscribeSubjectCatalog } from "./subjectCatalogStore";
import { getSubjectDraftErrors } from "../domain/subjectCatalog";

const context = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0 };
const draft = { name: "Иностранный язык", shortName: "ИЯ" };
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("local subject catalog service", () => {
  it("rechecks an unfinished creation after another catalog write and only saves the corrected draft", async () => {
    const pending = { name: "  Иностранный   язык  ", shortName: " ия " }; const original = { ...pending };
    expect(getSubjectDraftErrors(pending, readSubjectCatalogState().subjects)).toEqual([]); expect(values.size).toBe(0);
    await subjectCatalogService.create({ ...context, draft });
    const saved = values.get(SUBJECT_CATALOG_STORAGE_KEY);
    await expect(subjectCatalogService.create({ ...context, draft: pending })).rejects.toThrow("изменились");
    const current = readSubjectCatalogState(); const errors = getSubjectDraftErrors(pending, current.subjects);
    expect(errors.map((error) => error.field)).toEqual(["name", "shortName"]);
    await expect(subjectCatalogService.create({ ...context, expectedRevision: current.revision, draft: pending })).rejects.toThrow(errors[0].message);
    expect(pending).toEqual(original); expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe(saved); expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
    const created = await subjectCatalogService.create({ ...context, expectedRevision: current.revision, draft: { name: "  Второй   язык  ", shortName: " ВЯ " } });
    expect(created).toMatchObject({ name: "Второй язык", shortName: "ВЯ" });
    expect(readSubjectCatalogState().revision).toBe(2);
    const document = JSON.parse(values.get(SUBJECT_CATALOG_STORAGE_KEY)!);
    expect(document.history).toHaveLength(2); expect(document.subjects).toHaveLength(DEMO_SUBJECTS.length + 2);
  });
  it("does not persist seeds and preserves damaged bytes, excluding unavailable custom subjects from read models", async () => {
    expect(readSubjectCatalogState()).toMatchObject({ revision: 0, subjects: DEMO_SUBJECTS, error: "" });
    expect(values.size).toBe(0);
    await subjectCatalogService.create({ ...context, draft });
    values.set(SUBJECT_CATALOG_STORAGE_KEY, "damaged catalog bytes");
    expect(readSubjectCatalogState().error).toContain("не изменены");
    expect(SUBJECTS).toEqual(DEMO_SUBJECTS);
    await expect(subjectCatalogService.create({ ...context, draft })).rejects.toThrow();
    expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe("damaged catalog bytes");
  });
  it("updates all catalog views and exposes existing groups for assignments while leaving legacy offerings intact", async () => {
    const legacyOfferings = [...SUBJECT_GROUP_OFFERINGS];
    const listener = vi.fn(); const unsubscribe = subscribeSubjectCatalog(listener);
    const subject = await subjectCatalogService.create({ ...context, draft });
    unsubscribe();
    expect(listener).toHaveBeenCalledOnce();
    expect(subject.id).toMatch(/^subject-/);
    expect(readSubjectCatalogState()).toMatchObject({ revision: 1, error: "" });
    expect(getAcademicSubjectDefinition(subject.id)).toEqual(subject);
    expect(ACADEMIC_SUBJECTS.find((entry) => entry.id === subject.id)?.groups).toHaveLength(ACADEMIC_GROUPS.length);
    expect(getSubjectGroups(subject.id).map((group) => group.id)).toEqual(ACADEMIC_GROUPS.map((group) => group.id));
    expect(SUBJECT_GROUP_OFFERINGS.filter((entry) => entry.subjectId !== subject.id)).toEqual(legacyOfferings);
    expect(getSubjectGroups(subject.id).every((group) => group.attendance === 0)).toBe(true);
    await accountService.updateAssignments({ ...context, accountId: "teacher-elena-volkova", accountRevision: 1, memberships: [...readAccountsState().accounts[0].memberships, { subjectId: subject.id, groupIds: ["112-mko"] }] });
    expect(readAccountsState().accounts[0].memberships.some((entry) => entry.subjectId === subject.id)).toBe(true);
  });
  it("rejects stale and competing writes without losing the winner", async () => {
    const outcomes = await Promise.allSettled([subjectCatalogService.create({ ...context, draft }), subjectCatalogService.create({ ...context, draft: { name: "Новый предмет", shortName: "НП" } })]);
    expect(outcomes.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(readSubjectCatalogState().subjects).toHaveLength(DEMO_SUBJECTS.length + 1);
    expect(readSubjectCatalogState().revision).toBe(1);
    const previous = values.get(SUBJECT_CATALOG_STORAGE_KEY);
    await expect(subjectCatalogService.create({ ...context, expectedRevision: 1, draft: { ...draft, name: " иностранный  ЯЗЫК " } })).rejects.toThrow("названием");
    expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe(previous);
  });
  it("checks the current author account and preserves both stores on corrupted account data", async () => {
    const accounts = createInitialAccountsDocument();
    accounts.accounts[2].role = "teacher";
    accounts.accounts.push({ ...accounts.accounts[2], id: "another-admin", login: "another.admin", role: "configurator" });
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    await expect(subjectCatalogService.create({ ...context, draft })).rejects.toThrow("настройщику");
    expect(values.has(SUBJECT_CATALOG_STORAGE_KEY)).toBe(false);
    values.set(ACCOUNTS_STORAGE_KEY, "damaged accounts");
    await expect(subjectCatalogService.create({ ...context, draft })).rejects.toThrow("не изменены");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe("damaged accounts");
    expect(values.has(SUBJECT_CATALOG_STORAGE_KEY)).toBe(false);
  });
  it("blocks account writes on corrupted catalog data and refreshes views after a storage-event recovery", async () => {
    await subjectCatalogService.create({ ...context, draft });
    const validRaw = values.get(SUBJECT_CATALOG_STORAGE_KEY)!;
    values.set(SUBJECT_CATALOG_STORAGE_KEY, "damaged catalog");
    await expect(accountService.create({ ...context, draft: { name: "Новый преподаватель", login: "new.teacher", role: "teacher", memberships: [] } })).rejects.toThrow("каталог");
    expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
    expect(SUBJECTS).toHaveLength(DEMO_SUBJECTS.length);
    const listener = vi.fn(); const unsubscribe = subscribeSubjectCatalog(listener);
    values.set(SUBJECT_CATALOG_STORAGE_KEY, validRaw);
    const event = new Event("storage"); Object.defineProperty(event, "key", { value: SUBJECT_CATALOG_STORAGE_KEY });
    window.dispatchEvent(event);
    unsubscribe();
    expect(listener).toHaveBeenCalledOnce();
    expect(SUBJECTS).toHaveLength(DEMO_SUBJECTS.length + 1);
    expect(readSubjectCatalogState().error).toBe("");
    await expect(accountService.create({ ...context, draft: { name: "Новый преподаватель", login: "new.teacher", role: "teacher", memberships: [] } })).resolves.toMatchObject({ role: "teacher" });
  });
  it("rechecks catalog availability after asynchronous assignment guards", async () => {
    const unregister = registerTeachingAssignmentGuard(async () => { values.set(SUBJECT_CATALOG_STORAGE_KEY, "damaged while awaiting guard"); });
    try {
      await expect(accountService.updateAssignments({ ...context, accountId: "teacher-elena-volkova", accountRevision: 1, memberships: [] })).rejects.toThrow("каталог");
      expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
      expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe("damaged while awaiting guard");
    } finally { unregister(); }
  });
});
