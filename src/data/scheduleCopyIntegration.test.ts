import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { createInitialSubjectCatalogDocument, refreshAcademicCatalog, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import { GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
import { emptyGroupCatalog } from "../domain/groupCatalog";
import { previewManagedScheduleCopy, verifyManagedScheduleCopy, saveManagedScheduleDraft, publishManagedScheduleDraft, readManagedScheduleState } from "./managedScheduleStore";
import { MANAGED_SCHEDULE_KEY, type ManagedLesson } from "../domain/scheduleManagement";

const storage = new Map<string, string>();
const actorId = "configurator-demo";
const command = { actorId, expectedRevision: 0, weekStart: "2026-10-19", groupId: "112-mko" };
const request = { source: "draft" as const, sourceWeekStart: command.weekStart, targetWeekStart: "2026-10-26", groupId: command.groupId };
const lesson: ManagedLesson = { id: "managed:source", scheduleId: 999100, groupId: command.groupId, subjectId: "theory-of-probability", teacherId: "teacher-elena-volkova", teacherName: "Волкова Е.В.", date: "2026-10-24", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "999" };
const preview = () => previewManagedScheduleCopy({ actorId, request });
beforeEach(() => {
  storage.clear(); vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("window", undefined); vi.stubGlobal("navigator", undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog();
});
afterEach(() => { storage.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("schedule copy service", () => {
  it("previews and verifies without a write, then saves privately with distinct journal identities", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    await publishManagedScheduleDraft({ ...command, expectedRevision: 1 });
    const before = JSON.stringify([...storage]);
    const result = await previewManagedScheduleCopy({ actorId, request: { ...request, source: "published" } });
    await verifyManagedScheduleCopy({ actorId, versions: result });
    expect(JSON.stringify([...storage])).toBe(before);
    expect(result.lessons[0].date).toBe("2026-10-31");
    expect(result.lessons[0].id).not.toBe(lesson.id); expect(result.lessons[0].scheduleId).not.toBe(lesson.scheduleId);
    await saveManagedScheduleDraft({ ...command, weekStart: request.targetWeekStart, expectedRevision: 2, lessons: result.lessons });
    expect(readManagedScheduleState().snapshot.journal).toHaveLength(1);
    const published = await publishManagedScheduleDraft({ ...command, weekStart: request.targetWeekStart, expectedRevision: 3 });
    expect(published.journal).toHaveLength(2);
    expect(published.journal.find((entry) => entry.id === lesson.id)?.date).toBe(lesson.date);
  });
  it("reports conflicts in the target week without changing its publication", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    await saveManagedScheduleDraft({ ...command, expectedRevision: 1, weekStart: request.targetWeekStart, groupId: "113-mko", lessons: [{ ...lesson, id: "managed:other", scheduleId: 999101, groupId: "113-mko", date: "2026-10-31" }] });
    await publishManagedScheduleDraft({ ...command, expectedRevision: 2, weekStart: request.targetWeekStart, groupId: "113-mko" });
    const bytes = storage.get(MANAGED_SCHEDULE_KEY);
    const result = await preview();
    expect(result.conflicts.map((conflict) => conflict.kind)).toEqual(expect.arrayContaining(["teacher", "room"]));
    expect(storage.get(MANAGED_SCHEDULE_KEY)).toBe(bytes);
  });
  it("reports unavailable teaching assignments for correction instead of hiding lessons", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const accounts = createInitialAccountsDocument(); accounts.accounts[0].status = "blocked";
    storage.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    const result = await preview();
    expect(result.lessons).toHaveLength(1); expect(result.issues.join(" ")).toContain("преподаватель не назначен");
    await expect(saveManagedScheduleDraft({ ...command, weekStart: request.targetWeekStart, expectedRevision: 1, lessons: result.lessons })).rejects.toThrow("преподаватель");
  });
  it("requires a new preview after schedule or account changes", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const result = await preview();
    await saveManagedScheduleDraft({ ...command, expectedRevision: 1, lessons: [lesson] });
    await expect(verifyManagedScheduleCopy({ actorId, versions: result })).rejects.toThrow("изменились");
    const latest = await preview();
    const accounts = createInitialAccountsDocument(); accounts.revision = 1;
    storage.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    await expect(verifyManagedScheduleCopy({ actorId, versions: latest })).rejects.toThrow("изменились");
  });
  it("checks current permissions when preparing and applying, and preserves damaged storage", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    await expect(previewManagedScheduleCopy({ actorId: lesson.teacherId, request })).rejects.toThrow("настройщик");
    const result = await preview();
    await expect(verifyManagedScheduleCopy({ actorId: "anna-smirnova", versions: result })).rejects.toThrow("настройщик");
    storage.set(MANAGED_SCHEDULE_KEY, "damaged");
    await expect(preview()).rejects.toThrow("прочитать расписание");
    expect(storage.get(MANAGED_SCHEDULE_KEY)).toBe("damaged");
    storage.delete(MANAGED_SCHEDULE_KEY); storage.set(SUBJECT_CATALOG_STORAGE_KEY, "damaged catalog");
    await expect(preview()).rejects.toThrow("каталог недоступен");
    expect(storage.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe("damaged catalog");
  });
  it("invalidates previews after either catalog changes", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const result = await preview();
    storage.set(SUBJECT_CATALOG_STORAGE_KEY, JSON.stringify({ ...createInitialSubjectCatalogDocument(), revision: 1 }));
    await expect(verifyManagedScheduleCopy({ actorId, versions: result })).rejects.toThrow("изменились");
    const latest = await preview();
    storage.set(GROUP_CATALOG_STORAGE_KEY, JSON.stringify({ ...emptyGroupCatalog(), revision: 1 }));
    await expect(verifyManagedScheduleCopy({ actorId, versions: latest })).rejects.toThrow("изменились");
    expect(storage.get(MANAGED_SCHEDULE_KEY)).toBeDefined();
  });
  it("allocates above all existing numeric identities including cancelled history", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const state = readManagedScheduleState().snapshot;
    state.journal.push({ ...lesson, id: "managed:history", scheduleId: Date.now() * 1000 + 100000, journalState: "cancelled" });
    storage.set(MANAGED_SCHEDULE_KEY, JSON.stringify(state));
    const result = await preview();
    expect(result.lessons[0].scheduleId).toBeGreaterThan(state.journal[0].scheduleId);
  });
});
