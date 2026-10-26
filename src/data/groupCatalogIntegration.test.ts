import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACADEMIC_GROUPS, getSubjectGroups, refreshAcademicCatalog } from "./academicCatalog";
import { accountService, ACCOUNTS_STORAGE_KEY, readAccountsState } from "./accountStore";
import { groupCatalogService, GROUP_CATALOG_STORAGE_KEY, readGroupCatalogState } from "./groupCatalogStore";
import { getStudentGroupId } from "../domain/accounts";
import { withCreatedSubjectMemberships } from "../domain/studentMemberships";
import { createSubjectLessons } from "./lessons";
import { createDemoJournal, getJournalSnapshot } from "./journalStore";
import { getGroupStudentProfiles, getStudentProfile } from "./studentProfiles";
import { createDemoWeekSchedule } from "./demoSchedule";
import { getStudentDashboard } from "./studentDashboard";
import { publishManagedScheduleDraft, saveManagedScheduleDraft } from "./managedScheduleStore";
import { MANAGED_SCHEDULE_KEY } from "../domain/scheduleManagement";

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const actor = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0 };
const groupDraft = { name: "101-ИВТ", course: 1, campus: 3, admissionYear: 2026 };
const createStudent = async (groupId: string, login = "first.student") => accountService.create({ ...actor, expectedStudentNumber: (await accountService.previewStudentNumber({ ...actor, campus: 3 })).number, draft: { name: "Первый Студент", login, role: "student", studentCampus: 3, studentGroupId: groupId, memberships: [] } });

describe("institution groups and independent enrolment", () => {
  it("creates a group and student before any teaching assignment, with no generated history", async () => {
    const demo = createDemoWeekSchedule(new Date(2026, 9, 26));
    const group = await groupCatalogService.create({ ...actor, draft: groupDraft });
    expect(readGroupCatalogState().groups).toHaveLength(11);
    expect(ACADEMIC_GROUPS.find((entry) => entry.id === group.id)).toMatchObject(groupDraft);
    expect(getSubjectGroups("theory-of-probability").some((entry) => entry.id === group.id)).toBe(true);
    expect(createSubjectLessons("theory-of-probability", group.id)).toEqual([]);
    expect(createDemoJournal("theory-of-probability", group.id)).toEqual([]);
    const student = await createStudent(group.id);
    expect(student.memberships).toEqual([]);
    expect(getStudentGroupId(student)).toBe(group.id);
    expect(readAccountsState().accounts.find((entry) => entry.id === student.id)?.studentRecord?.campus).toBe(3);
    expect(getGroupStudentProfiles(group.name)).toMatchObject([{ id: student.id, name: student.name, group: group.name }]);
    expect(getStudentProfile(student.id, group.id)?.studentNumber).toBe(student.studentRecord!.number);
    expect(getStudentDashboard({ studentId: student.id, studentGroupId: group.id, memberships: [], now: new Date(2026, 9, 26) }).groupName).toBe(group.name);
    expect(createDemoWeekSchedule(new Date(2026, 9, 26))).toEqual(demo);
  });
  it("grants an assigned discipline to the enrolled student and publishes its first real lesson", async () => {
    const group = await groupCatalogService.create({ ...actor, draft: groupDraft });
    const student = await createStudent(group.id);
    const teacher = readAccountsState().accounts[0];
    await accountService.updateAssignments({ ...actor, expectedRevision: 1, accountId: teacher.id, accountRevision: teacher.revision, memberships: teacher.memberships.map((entry) => entry.subjectId === "theory-of-probability" ? { ...entry, groupIds: [...entry.groupIds, group.id] } : entry) });
    const projected = withCreatedSubjectMemberships(student, readAccountsState().accounts, new Set(["theory-of-probability"]));
    expect(projected.memberships).toEqual([{ subjectId: "theory-of-probability", groupIds: [group.id] }]);
    expect(getJournalSnapshot("theory-of-probability", group.id)).toMatchObject([{ id: student.id, attendance: {}, grades: {} }]);
    const scope = { actorId: actor.actorId, groupId: group.id, weekStart: "2099-10-19" };
    const lesson = { id: "managed:new-group", scheduleId: 900001, groupId: group.id, subjectId: "theory-of-probability", teacherId: teacher.id, teacherName: teacher.name, date: scope.weekStart, startsAt: "07:00", endsAt: "08:00", room: "QA-NEW", type: "practice" as const };
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    await publishManagedScheduleDraft({ ...scope, expectedRevision: 1 });
    expect(createSubjectLessons(lesson.subjectId, group.id)).toMatchObject([{ id: lesson.id }]);
    expect(createSubjectLessons(lesson.subjectId, group.id)).toHaveLength(1);
  });
  it("records a group transfer while retaining the account ID and immutable record number", async () => {
    const first = await groupCatalogService.create({ ...actor, draft: groupDraft });
    const second = await groupCatalogService.create({ ...actor, expectedRevision: 1, draft: { ...groupDraft, name: "102-ИВТ" } });
    const student = await createStudent(first.id);
    const updated = await accountService.updateDetails({ ...actor, expectedRevision: 1, accountId: student.id, accountRevision: student.revision, details: { name: student.name, login: student.login, studentGroupId: second.id, memberships: [] } });
    expect(updated.studentRecord).toEqual(student.studentRecord);
    expect(updated.id).toBe(student.id);
    expect(getStudentGroupId(updated)).toBe(second.id);
    expect(readAccountsState().history.at(-1)?.changes).toContainEqual({ field: "group", before: first.id, after: second.id });
    expect(getGroupStudentProfiles(first.name)).toEqual([]);
    expect(getGroupStudentProfiles(second.name)).toMatchObject([{ id: student.id }]);
  });
  it("rejects unknown groups without consuming a record number or changing accounts", async () => {
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(createStudent("missing")).rejects.toThrow("не найдена");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before);
    expect((await accountService.previewStudentNumber({ ...actor, campus: 3 })).number).toMatch(/30001$/);
  });
  it("serializes competing creations and preserves the losing form's version conflict", async () => {
    const results = await Promise.allSettled([groupCatalogService.create({ ...actor, draft: groupDraft }), groupCatalogService.create({ ...actor, draft: { ...groupDraft, name: "102-ИВТ" } })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(readGroupCatalogState().managed).toHaveLength(1);
  });
  it("preserves corrupt group bytes and blocks dependent account and schedule writes", async () => {
    values.set(GROUP_CATALOG_STORAGE_KEY, "corrupt groups");
    expect(readGroupCatalogState().error).toBeTruthy();
    await expect(groupCatalogService.create({ ...actor, draft: groupDraft })).rejects.toThrow("недоступен");
    await expect(createStudent("112-mko")).rejects.toThrow("каталог");
    await expect(saveManagedScheduleDraft({ actorId: actor.actorId, expectedRevision: 0, groupId: "112-mko", weekStart: "2026-10-26", lessons: [] })).rejects.toThrow("недоступен");
    expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe("corrupt groups");
    expect(values.has(ACCOUNTS_STORAGE_KEY)).toBe(false);
    expect(values.has(MANAGED_SCHEDULE_KEY)).toBe(false);
  });
  it("keeps the catalogue intact after a storage write failure", async () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: () => { throw new Error("Quota exceeded"); } });
    await expect(groupCatalogService.create({ ...actor, draft: groupDraft })).rejects.toThrow("Quota");
    expect(values.has(GROUP_CATALOG_STORAGE_KEY)).toBe(false);
    expect(readGroupCatalogState().managed).toEqual([]);
  });
});
