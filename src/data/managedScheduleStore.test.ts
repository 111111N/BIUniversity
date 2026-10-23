import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialAccountsDocument } from "./accountStore";
import { getManagedScheduleTeachers, publishManagedScheduleDraft, readManagedScheduleState, saveManagedScheduleDraft } from "./managedScheduleStore";
import { MANAGED_SCHEDULE_KEY, type ManagedLesson } from "../domain/scheduleManagement";
import { getDemoWeekSchedule } from "./schedule";
import { createSubjectLessons } from "./lessons";

const storage = new Map<string, string>();
const command = { actorId: "configurator-demo", expectedRevision: 0, weekStart: "2026-10-19", groupId: "112-mko" };
const lesson: ManagedLesson = { id: "managed:published", scheduleId: 999100, groupId: "112-mko", subjectId: "theory-of-probability", teacherId: "teacher-elena-volkova", teacherName: "Волкова Е.В.", date: "2026-10-24", startsAt: "09:00", endsAt: "10:30", type: "lecture", room: "999" };
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("navigator", undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  storage.clear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("managed schedule local service", () => {
  it("saves privately then atomically publishes to schedule and journal without changing legacy lesson IDs", async () => {
    const legacy = createSubjectLessons(lesson.subjectId, lesson.groupId).map((entry) => entry.id);
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    expect(getDemoWeekSchedule(new Date(2026, 9, 19)).some((entry) => entry.id === lesson.scheduleId)).toBe(false);
    const snapshot = await publishManagedScheduleDraft({ ...command, expectedRevision: 1 });
    expect(snapshot.revision).toBe(2);
    expect(snapshot.drafts).toEqual([]);
    expect(snapshot.published[0]).toMatchObject({ updatedBy: command.actorId, publishedBy: command.actorId, updatedAt: expect.any(String), publishedAt: expect.any(String) });
    expect(getDemoWeekSchedule(new Date(2026, 9, 19)).filter((entry) => entry.group === "112-МКо")).toMatchObject([{ id: lesson.scheduleId, date: lesson.date }]);
    const journal = createSubjectLessons(lesson.subjectId, lesson.groupId);
    expect(journal.filter((entry) => legacy.includes(entry.id)).map((entry) => entry.id)).toEqual(legacy);
    expect(journal.find((entry) => entry.id === lesson.id)).toMatchObject({ date: lesson.date, startsAt: "09:00" });
  });
  it("rejects stale and unauthorized writes while preserving stored bytes", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    const original = storage.get(MANAGED_SCHEDULE_KEY);
    await expect(saveManagedScheduleDraft({ ...command, lessons: [] })).rejects.toThrow("другой вкладке");
    await expect(saveManagedScheduleDraft({ ...command, expectedRevision: 1, actorId: lesson.teacherId, lessons: [] })).rejects.toThrow("настройщик");
    expect(storage.get(MANAGED_SCHEDULE_KEY)).toBe(original);
  });
  it("does not offer legacy display-only teachers for new lessons without an account and assignments", async () => {
    expect(getManagedScheduleTeachers().some((entry) => entry.id === "teacher-pavel-petrov")).toBe(false);
    await expect(saveManagedScheduleDraft({ ...command, lessons: [{ ...lesson, teacherId: "teacher-pavel-petrov" }] })).rejects.toThrow("не назначен");
    expect(storage.has(MANAGED_SCHEDULE_KEY)).toBe(false);
  });
  it("preserves corrupt storage and never overwrites it with defaults", async () => {
    storage.set(MANAGED_SCHEDULE_KEY, "original damaged bytes");
    expect(readManagedScheduleState().error).not.toBe("");
    expect(getDemoWeekSchedule(new Date(2026, 9, 19))).toEqual([]);
    await expect(saveManagedScheduleDraft({ ...command, lessons: [] })).rejects.toThrow("прочитать");
    expect(storage.get(MANAGED_SCHEDULE_KEY)).toBe("original damaged bytes");
  });
  it("allows conflicting drafts but blocks publication against another published group", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    await publishManagedScheduleDraft({ ...command, expectedRevision: 1 });
    await saveManagedScheduleDraft({ ...command, expectedRevision: 2, groupId: "113-mko", lessons: [{ ...lesson, id: "managed:second", scheduleId: 999101, groupId: "113-mko" }] });
    const before = storage.get(MANAGED_SCHEDULE_KEY);
    await expect(publishManagedScheduleDraft({ ...command, expectedRevision: 3, groupId: "113-mko" })).rejects.toThrow("занят");
    expect(storage.get(MANAGED_SCHEDULE_KEY)).toBe(before);
  });
  it("rechecks the actual teacher role at publication and lists newly created teachers", async () => {
    const accounts = createInitialAccountsDocument();
    accounts.accounts.push({ ...accounts.accounts[0], id: "new-teacher", login: "new.teacher", name: "Новый преподаватель", scheduleName: undefined });
    storage.set("bi-university-accounts-v1", JSON.stringify(accounts));
    expect(getManagedScheduleTeachers().some((entry) => entry.id === "new-teacher")).toBe(true);
    await saveManagedScheduleDraft({ ...command, lessons: [{ ...lesson, teacherId: "new-teacher" }] });
    const demoted = accounts.accounts.find((entry) => entry.id === "new-teacher")!;
    demoted.role = "configurator";
    demoted.memberships = [];
    storage.set("bi-university-accounts-v1", JSON.stringify(accounts));
    await expect(publishManagedScheduleDraft({ ...command, expectedRevision: 1 })).rejects.toThrow("преподаватель");
    expect(readManagedScheduleState().snapshot.published).toEqual([]);
  });
  it("keeps the journal identity on a moved pair and retains cancelled entries after empty publication", async () => {
    await saveManagedScheduleDraft({ ...command, lessons: [lesson] });
    await publishManagedScheduleDraft({ ...command, expectedRevision: 1 });
    await saveManagedScheduleDraft({ ...command, expectedRevision: 2, lessons: [{ ...lesson, startsAt: "11:00", endsAt: "12:30" }] });
    await publishManagedScheduleDraft({ ...command, expectedRevision: 3 });
    expect(createSubjectLessons(lesson.subjectId, lesson.groupId).filter((entry) => entry.id === lesson.id)).toMatchObject([{ startsAt: "11:00" }]);
    await saveManagedScheduleDraft({ ...command, expectedRevision: 4, lessons: [] });
    await publishManagedScheduleDraft({ ...command, expectedRevision: 5 });
    expect(getDemoWeekSchedule(new Date(2026, 9, 19)).filter((entry) => entry.group === "112-МКо")).toEqual([]);
    expect(createSubjectLessons(lesson.subjectId, lesson.groupId).find((entry) => entry.id === lesson.id)?.state).toBe("cancelled");
  });
});
