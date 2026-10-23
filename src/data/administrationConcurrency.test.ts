import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_STORAGE_KEY, accountService, readAccountsState } from "./accountStore";
import { connectAdministrationPolicies } from "./administrationIntegration";
import { publishManagedScheduleDraft, readManagedScheduleState, saveManagedScheduleDraft } from "./managedScheduleStore";
import { getManagedWeekKey, MANAGED_SCHEDULE_KEY, type ManagedLesson } from "../domain/scheduleManagement";

const weekStart = getManagedWeekKey("2099-10-19");
const actorId = "configurator-demo";
const lesson: ManagedLesson = { id: "managed:concurrency", scheduleId: 424242, subjectId: "theory-of-probability", groupId: "112-mko", teacherId: "teacher-elena-volkova", teacherName: "Волкова Е.В.", date: weekStart, startsAt: "07:00", endsAt: "08:00", type: "practice", room: "QA-700" };
const scope = { actorId, weekStart, groupId: lesson.groupId };
const roleChange = { actorId, actorRevision: 1, expectedRevision: 0, accountId: lesson.teacherId, accountRevision: 1, role: "student" as const, memberships: [{ subjectId: lesson.subjectId, groupIds: [lesson.groupId] }] };
let values: Map<string, string>;
let disconnect: () => void;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  disconnect = connectAdministrationPolicies();
});
afterEach(() => { disconnect(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("account and timetable command concurrency", () => {
  it("rejects demotion when a queued publication wins, without modifying the teacher", async () => {
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    const [publication, demotion] = await Promise.allSettled([
      publishManagedScheduleDraft({ ...scope, expectedRevision: 1 }),
      accountService.changeRole(roleChange),
    ]);
    expect(publication.status).toBe("fulfilled");
    expect(demotion.status).toBe("rejected");
    expect(readAccountsState().accounts.find((account) => account.id === lesson.teacherId)?.role).toBe("teacher");
    expect(readManagedScheduleState().snapshot.published[0].lessons[0].teacherId).toBe(lesson.teacherId);
  });
  it("rejects publication when a queued demotion wins, keeping the draft for correction", async () => {
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    const [demotion, publication] = await Promise.allSettled([
      accountService.changeRole(roleChange),
      publishManagedScheduleDraft({ ...scope, expectedRevision: 1 }),
    ]);
    expect(demotion.status).toBe("fulfilled");
    expect(publication.status).toBe("rejected");
    expect(readAccountsState().accounts.find((account) => account.id === lesson.teacherId)?.role).toBe("student");
    expect(readManagedScheduleState().snapshot.published).toHaveLength(0);
    expect(readManagedScheduleState().snapshot.drafts).toHaveLength(1);
  });
  it("keeps both stores untouched when future-teaching validation cannot read its source", async () => {
    values.set(MANAGED_SCHEDULE_KEY, "damaged-timetable");
    await expect(accountService.changeRole(roleChange)).rejects.toThrow("недоступна");
    expect(values.get(MANAGED_SCHEDULE_KEY)).toBe("damaged-timetable");
    expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
  });
  it("prevents removing a teaching assignment after a queued publication", async () => {
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    const [publication, reassignment] = await Promise.allSettled([
      publishManagedScheduleDraft({ ...scope, expectedRevision: 1 }),
      accountService.updateAssignments({ ...roleChange, memberships: [] }),
    ]);
    expect(publication.status).toBe("fulfilled");
    expect(reassignment.status).toBe("rejected");
    expect(readAccountsState().accounts.find((account) => account.id === lesson.teacherId)?.memberships.some((entry) => entry.subjectId === lesson.subjectId && entry.groupIds.includes(lesson.groupId))).toBe(true);
  });
  it("keeps a draft unpublished when its teaching assignment is removed first", async () => {
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    const [reassignment, publication] = await Promise.allSettled([
      accountService.updateAssignments({ ...roleChange, memberships: [] }),
      publishManagedScheduleDraft({ ...scope, expectedRevision: 1 }),
    ]);
    expect(reassignment.status).toBe("fulfilled");
    expect(publication.status).toBe("rejected");
    expect(readManagedScheduleState().snapshot.published).toHaveLength(0);
    expect(readManagedScheduleState().snapshot.drafts).toHaveLength(1);
  });
});
