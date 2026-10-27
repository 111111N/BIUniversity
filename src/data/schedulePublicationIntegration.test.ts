import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { createInitialSubjectCatalogDocument, refreshAcademicCatalog, SUBJECT_CATALOG_STORAGE_KEY } from "./academicCatalog";
import { GROUP_CATALOG_STORAGE_KEY } from "./groupCatalogRead";
import { emptyGroupCatalog } from "../domain/groupCatalog";
import { previewManagedSchedulePublication, publishManagedScheduleDraft, readManagedScheduleState, saveManagedScheduleDraft } from "./managedScheduleStore";
import { MANAGED_SCHEDULE_KEY, type ManagedLesson } from "../domain/scheduleManagement";
import { executeAdministrationWrite } from "./administrationWrite";

const values = new Map<string, string>();
const command = { actorId: "configurator-demo", expectedRevision: 0, weekStart: "2026-10-19", groupId: "112-mko" };
const lesson: ManagedLesson = { id: "managed:source", scheduleId: 999100, groupId: command.groupId, subjectId: "theory-of-probability", teacherId: "teacher-elena-volkova", teacherName: "Волкова Е.В.", date: "2026-10-24", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "999" };
const preview = (expectedRevision: number) => previewManagedSchedulePublication({ ...command, expectedRevision });
beforeEach(() => { values.clear(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }); vi.stubGlobal("window", undefined); vi.stubGlobal("navigator", undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog(); });
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("publication review service", () => {
  it("previews saved data without writes and publishes exactly the reviewed revision", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const bytes = JSON.stringify([...values]);
    const result = await preview(1);
    expect(result).toMatchObject({ wasPublished: false, beforeCount: 0, afterCount: 1, counts: { added: 1 }, versions: { scheduleRevision: 1, accountsRevision: 0 } });
    expect(JSON.stringify([...values])).toBe(bytes);
    const next = await publishManagedScheduleDraft({ ...command, expectedRevision: 1, reviewedVersions: result.versions });
    expect(next.published[0].lessons).toEqual([lesson]); expect(next.journal[0].journalState).toBe("active");
  });
  it("compares with the publication and retains cancelled journal entries after empty publication", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] }); await publishManagedScheduleDraft({ ...command, expectedRevision: 1 });
    await saveManagedScheduleDraft({ ...command, expectedRevision: 2, lessons: [] });
    const result = await preview(3);
    expect(result).toMatchObject({ wasPublished: true, beforeCount: 1, afterCount: 0, counts: { removed: 1 } });
    const next = await publishManagedScheduleDraft({ ...command, expectedRevision: 3, reviewedVersions: result.versions });
    expect(next.journal[0]).toMatchObject({ id: lesson.id, journalState: "cancelled" });
  });
  it("rejects a changed draft without publishing newer unseen lessons", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] }); const result = await preview(1);
    await saveManagedScheduleDraft({ ...command, expectedRevision: 1, lessons: [{ ...lesson, room: "998" }] });
    const bytes = values.get(MANAGED_SCHEDULE_KEY);
    await expect(publishManagedScheduleDraft({ ...command, expectedRevision: 1, reviewedVersions: result.versions })).rejects.toThrow("другой вкладке");
    expect(values.get(MANAGED_SCHEDULE_KEY)).toBe(bytes); expect(readManagedScheduleState().snapshot.published).toEqual([]);
  });
  it("checks all other reviewed sources inside the publication write boundary", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const changes = [
      [ACCOUNTS_STORAGE_KEY, JSON.stringify({ ...createInitialAccountsDocument(), revision: 1 })],
      [SUBJECT_CATALOG_STORAGE_KEY, JSON.stringify({ ...createInitialSubjectCatalogDocument(), revision: 1 })],
      [GROUP_CATALOG_STORAGE_KEY, JSON.stringify({ ...emptyGroupCatalog(), revision: 1 })],
    ];
    for (const [key, value] of changes) {
      const result = await preview(1); values.set(key, value);
      const bytes = values.get(MANAGED_SCHEDULE_KEY);
      await expect(publishManagedScheduleDraft({ ...command, expectedRevision: 1, reviewedVersions: result.versions })).rejects.toThrow("после проверки");
      expect(values.get(MANAGED_SCHEDULE_KEY)).toBe(bytes);
      values.delete(key); refreshAcademicCatalog();
    }
  });
  it("requires a saved draft, current revision and configurator access", async () => {
    await expect(preview(0)).rejects.toThrow("черновик");
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    await expect(preview(0)).rejects.toThrow("изменилось");
    await expect(previewManagedSchedulePublication({ ...command, expectedRevision: 1, actorId: "anna-smirnova" })).rejects.toThrow("настройщику");
    const result = await preview(1);
    await expect(publishManagedScheduleDraft({ ...command, expectedRevision: 1, actorId: "anna-smirnova", reviewedVersions: result.versions })).rejects.toThrow("настройщик");
  });
  it("rechecks reviewed versions after an earlier queued write, immediately before publication", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const result = await preview(1);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const earlierWrite = executeAdministrationWrite(async () => { await gate; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify({ ...createInitialAccountsDocument(), revision: 1 })); });
    const attempt = publishManagedScheduleDraft({ ...command, expectedRevision: 1, reviewedVersions: result.versions });
    const rejected = expect(attempt).rejects.toThrow("после проверки");
    release(); await earlierWrite; await rejected;
    expect(readManagedScheduleState().snapshot.published).toEqual([]);
    expect(readManagedScheduleState().snapshot.drafts).toHaveLength(1);
  });
  it("fails closed for damaged sources and invalidated assignments", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const state = createInitialAccountsDocument(); state.accounts[0].memberships = [];
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    await expect(preview(1)).rejects.toThrow("преподаватель не назначен");
    values.delete(ACCOUNTS_STORAGE_KEY); values.set(MANAGED_SCHEDULE_KEY, "damaged");
    await expect(preview(1)).rejects.toThrow("прочитать расписание"); expect(values.get(MANAGED_SCHEDULE_KEY)).toBe("damaged");
  });
});
