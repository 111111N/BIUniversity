import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectArchivedGroupStates } from "./backupGroupStates";
import { BACKUP_CORE_DOCUMENTS, inspectBackupDocuments } from "./localBackupDocuments";
import { coreBackupFixture } from "../testSupport/localBackupDocuments";
import type { ManagedLesson } from "./scheduleManagement";

const forbidden = vi.fn(() => { throw new Error("Group state inspection must not read or write live stores"); });
beforeEach(() => { forbidden.mockClear(); vi.stubGlobal("localStorage", { getItem: forbidden, setItem: forbidden }); vi.stubGlobal("sessionStorage", { getItem: forbidden }); vi.stubGlobal("indexedDB", { open: forbidden }); });
afterEach(() => { expect(forbidden).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

const fixture = () => { const state = coreBackupFixture(); state.groups.groups[0].status = "archived"; return state; };
type Fixture = ReturnType<typeof fixture>;
const inspect = (state: Fixture) => inspectArchivedGroupStates(state.groups, state.accounts, state.schedule, state.archive.completedAt);
const published = (state: Fixture, end: string) => {
  const lesson: ManagedLesson = { ...state.schedule.drafts[0].lessons[0], endsAt: end };
  state.schedule.drafts.length = 0;
  state.schedule.published = [{ weekStart: "2026-10-26", groupId: "group-1", lessons: [lesson] }];
  state.schedule.journal = [{ ...lesson, journalState: "active" }];
};

describe("archived group states", () => {
  it("reports each saved dependency without invalidating a readable catalog or exposing names", async () => {
    const state = fixture(); state.groups.groups[0].name = "PRIVATE GROUP";
    for (const account of state.accounts.accounts) account.name = "PRIVATE NAME";
    state.schedule.drafts[0].lessons[0].teacherName = "PRIVATE TEACHER"; state.schedule.drafts[0].lessons[0].room = "PRIVATE ROOM";
    state.save(); const before = JSON.stringify(state.archive);
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 4, invalid: 0, errors: 3, reviews: 0 });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "archived-group-assignment", referenceId: "group-1", recordId: JSON.stringify(["teaching-assignment", "teacher-1", "subject-1"]) }),
      expect.objectContaining({ code: "archived-group-student", referenceId: "group-1", recordId: JSON.stringify(["student", "student-1"]) }),
      expect.objectContaining({ code: "archived-group-draft", referenceId: "group-1", recordId: JSON.stringify(["draft", "managed:lesson-1"]) }),
    ]);
    const check = result.checks.find((item) => item.kind === "groups")!;
    expect(check.message).toContain("Архивированных групп: 1. Связей с учащимися: 1; назначений преподавателей: 1; пар черновиков: 1");
    expect(check.message).toContain("не проверка истории архивирования");
    expect(JSON.stringify(result)).not.toContain("PRIVATE"); expect(JSON.stringify(state.archive)).toBe(before);
  });

  it.each([undefined, "active"] as const)("does not flag dependencies of a group with state %s", async (status) => {
    const state = fixture(); state.groups.groups[0].status = status;
    const result = await inspect(state); expect(result.issues).toEqual([]); expect(result.summary).toContain("Архивированных групп: 0");
  });

  it.each([undefined, "studying"] as const)("does not treat a blocked account as completed study: %s", async (enrollmentStatus) => {
    const state = fixture(); Object.assign(state.accounts.accounts[2], { status: "blocked", enrollmentStatus });
    expect((await inspect(state)).issues.some((issue) => issue.code === "archived-group-student")).toBe(true);
  });

  it.each(["graduated", "withdrawn"] as const)("preserves completed students in their historical group: %s", async (enrollmentStatus) => {
    const state = fixture(); state.accounts.accounts[2].enrollmentStatus = enrollmentStatus;
    expect((await inspect(state)).issues.some((issue) => issue.code === "archived-group-student")).toBe(false);
  });

  it("uses the legacy student's single membership group and does not treat another current role as a student", async () => {
    const state = fixture(); delete state.accounts.accounts[2].studentGroupId;
    expect((await inspect(state)).issues.some((issue) => issue.code === "archived-group-student")).toBe(true);
    state.accounts.accounts[2].role = "teacher";
    expect((await inspect(state)).issues.some((issue) => issue.code === "archived-group-student")).toBe(false);
  });

  it("counts assignments of blocked teachers and matches exact group IDs across memberships", async () => {
    const state = fixture(); const teacher = state.accounts.accounts[1]; teacher.status = "blocked";
    teacher.memberships = [{ subjectId: "subject:one", groupIds: ["group-1", "group-10"] }, { subjectId: "subject:two", groupIds: ["group-1"] }];
    const result = await inspect(state); const assignments = result.issues.filter((issue) => issue.code === "archived-group-assignment");
    expect(assignments).toHaveLength(2); expect(assignments.every((issue) => issue.referenceId === "group-1")).toBe(true);
    expect(assignments[1].recordId).toBe(JSON.stringify(["teaching-assignment", "teacher-1", "subject:two"]));
  });

  it.each(["12:59", "13:00", "13:01"])("classifies published lessons by Moscow end time relative to the archive: %s", async (end) => {
    const state = fixture(); published(state, end); state.save();
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.checks.find((item) => item.kind === "schedule")!.status).toBe("valid");
    expect(result.issues.some((issue) => issue.code === "archived-group-future-lesson")).toBe(end === "13:01");
    const message = result.checks.find((item) => item.kind === "groups")!.message;
    expect(message).toContain(`незавершённых опубликованных пар на дату архива: ${end === "13:01" ? 1 : 0}`);
    expect(message).toContain(`прошедших опубликованных пар: ${end === "13:01" ? 0 : 1}`);
  });

  it("does not change classification as the device clock moves", async () => {
    const state = fixture(); published(state, "13:01"); const first = await inspect(state);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01T00:00:00Z"));
    try { expect(await inspect(state)).toEqual(first); } finally { clock.mockRestore(); }
  });

  it("does not treat cancelled or rescheduled historical journal entries as current lessons", async () => {
    const state = fixture(); const lesson = state.schedule.drafts[0].lessons[0];
    state.schedule.journal = [{ ...lesson, endsAt: "23:00", journalState: "cancelled" }, { ...lesson, groupId: "old-group", journalState: "rescheduled" }];
    state.schedule.drafts[0].lessons.length = 0; state.accounts.accounts = state.accounts.accounts.slice(0, 1);
    const result = await inspect(state); expect(result.issues).toEqual([]); expect(result.summary).toContain("прошедших опубликованных пар: 0");
  });

  it("allows an empty draft week and archived groups without current blockers", async () => {
    const state = fixture(); state.schedule.drafts[0].lessons.length = 0;
    state.accounts.accounts[1].memberships.length = 0; state.accounts.accounts[2].enrollmentStatus = "graduated";
    expect((await inspect(state)).issues).toEqual([]);
  });

  it("reports unavailable sources once without interpreting them as empty", async () => {
    const state = fixture(); state.groups.groups.push({ ...state.groups.groups[0], id: "group-2", name: "102" });
    const result = await inspectArchivedGroupStates(state.groups, undefined, undefined, state.archive.completedAt);
    expect(result.issues.map((issue) => issue.code)).toEqual(["unchecked-archived-group-accounts", "unchecked-archived-group-schedule"]);
    expect(result.issues.every((issue) => issue.level === "review")).toBe(true);
    expect(result.summary).toContain("Связей с учащимися: не проверено"); expect(result.summary).toContain("пар черновиков: не проверено");
    expect((await inspectArchivedGroupStates(undefined, state.accounts, state.schedule, state.archive.completedAt)).issues).toEqual([]);
  });

  it("does not claim that missing or unreadable catalogs or sources were checked", async () => {
    const state = fixture(); state.save();
    state.archive.localStorage = state.archive.localStorage.filter((item) => item.key !== BACKUP_CORE_DOCUMENTS.accounts.key);
    state.archive.localStorage.find((item) => item.key === BACKUP_CORE_DOCUMENTS.schedule.key)!.raw = "{}";
    const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.issues.filter((issue) => issue.code.startsWith("unchecked-archived-group-"))).toHaveLength(2);
    expect(result.issues.some((issue) => issue.code === "archived-group-student")).toBe(false);
    state.archive.localStorage.find((item) => item.key === BACKUP_CORE_DOCUMENTS.groups.key)!.raw = "{}";
    const invalid = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(invalid.checks.find((item) => item.kind === "groups")).toMatchObject({ status: "invalid", message: expect.stringContaining("Состояния групп не проверены") });
  });

  it("does not substitute device time for an invalid archive date while still checking drafts", async () => {
    const state = fixture(); const result = await inspectArchivedGroupStates(state.groups, state.accounts, state.schedule, "invalid");
    expect(result.issues.some((issue) => issue.code === "unchecked-archived-group-time")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "archived-group-draft")).toBe(true);
    expect(result.summary).toContain("незавершённых опубликованных пар на дату архива: не проверено");
  });

  it("retains all dependency findings beyond 200 and checks only archived groups", async () => {
    const state = fixture(); state.accounts.accounts = state.accounts.accounts.slice(0, 2); state.accounts.accounts[1].memberships.length = 0;
    const original = state.schedule.drafts[0].lessons[0];
    const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    state.schedule.drafts[0].lessons = Array.from({ length: 205 }, (_, index) => ({ ...original, id: `managed:lesson-${index}`, scheduleId: index + 1, startsAt: time(540 + index), endsAt: time(541 + index) }));
    state.schedule.drafts.push({ ...state.schedule.drafts[0], groupId: "other", lessons: [{ ...original, id: "managed:other", groupId: "other", scheduleId: 1000 }] });
    state.groups.groups.push({ ...state.groups.groups[0], id: "other", name: "102", status: "active" });
    state.save(); const result = await inspectBackupDocuments(state.archive, "configurator-demo");
    expect(result.counts).toMatchObject({ valid: 4, errors: 205, reviews: 0 });
    expect(result.issues.at(-1)).toMatchObject({ code: "archived-group-draft", recordId: JSON.stringify(["draft", "managed:lesson-204"]) });
  });

  it("supports cancellation inside a nested assignment scan", async () => {
    const state = fixture(); state.accounts.accounts[1].memberships[0].groupIds = Array.from({ length: 1000 }, (_, index) => `group-${index}`);
    const controller = new AbortController(); const pending = inspectArchivedGroupStates(state.groups, state.accounts, state.schedule, state.archive.completedAt, controller.signal);
    setTimeout(() => controller.abort(), 0); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const stopped = new AbortController(); stopped.abort();
    await expect(inspectArchivedGroupStates(undefined, undefined, undefined, state.archive.completedAt, stopped.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
