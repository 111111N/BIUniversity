import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, readAccountsState } from "./accountStore";
import { groupCatalogService, GROUP_CATALOG_STORAGE_KEY, readGroupCatalogState } from "./groupCatalogStore";
import { ACADEMIC_GROUPS, getAcademicGroupByName, getAcademicGroupNameAt, getSubjectGroups, refreshAcademicCatalog } from "./academicCatalog";
import { createEmptyManagedSchedule, MANAGED_SCHEDULE_KEY, type ManagedLesson } from "../domain/scheduleManagement";
import { saveManagedScheduleDraft, publishManagedScheduleDraft } from "./managedScheduleStore";
import { getDemoWeekSchedule, getPersonalSchedule } from "./schedule";
import { decodeGroupCatalog, type ManagedGroup } from "../domain/groupCatalog";
import { getStudentGroupId } from "../domain/accounts";
import type { StudentEnrollmentStatus } from "../domain/studentEnrollment";

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-26T10:00:00Z")); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const actor = { actorId: "configurator-demo", actorRevision: 1 };
const draft = { name: "101-ИВТ", course: 1, campus: 3, admissionYear: 2026 };
const create = () => groupCatalogService.create({ ...actor, expectedRevision: 0, draft });
const target = (group: ManagedGroup) => ({ ...actor, groupId: group.id, groupRevision: group.revision, expectedRevision: readGroupCatalogState().revision });
const student = async (group: ManagedGroup) => accountService.create({ ...actor, expectedRevision: readAccountsState().revision, expectedStudentNumber: (await accountService.previewStudentNumber({ ...actor, campus: 3 })).number, draft: { name: "Студент Группы", login: `student.${readAccountsState().revision}`, role: "student", studentGroupId: group.id, studentCampus: 3, memberships: [] } });
const enrollment = (accountId: string, status: StudentEnrollmentStatus) => { const state = readAccountsState(); const account = state.accounts.find((entry) => entry.id === accountId)!; return accountService.updateDetails({ ...actor, expectedRevision: state.revision, accountId, accountRevision: account.revision, details: { name: account.name, login: account.login, email: account.email, enrollmentStatus: status } }); };
const archive = async (group: ManagedGroup) => groupCatalogService.changeStatus({ ...await groupCatalogService.previewStatus(target(group)), status: "archived" });
const lessonFor = (groupId: string, date = "2026-10-19"): ManagedLesson => ({ id: "managed:group-history", scheduleId: 808080, groupId, subjectId: "theory-of-probability", teacherId: "teacher-elena-volkova", teacherName: "Волкова Е.В.", date, startsAt: "07:00", endsAt: "08:00", type: "practice", room: "QA-OLD" });
const writeSchedule = (groupId: string, date = "2026-10-19", withDraft = false) => {
  const lesson = lessonFor(groupId, date); const week = { groupId, weekStart: date, lessons: [lesson] };
  values.set(MANAGED_SCHEDULE_KEY, JSON.stringify({ ...createEmptyManagedSchedule(), revision: 1, published: [week], drafts: withDraft ? [week] : [], journal: [{ ...lesson, journalState: "active" }] }));
};

describe("group lifecycle and learning status", () => {
  it("keeps identities, student records and old published names after editing", async () => {
    const group = await create(); const account = await student(group); const rawAccounts = values.get(ACCOUNTS_STORAGE_KEY);
    writeSchedule(group.id);
    const next = await groupCatalogService.update({ ...target(group), draft: { ...draft, name: "201-ИВТ", course: 2, campus: 9 } });
    expect(next.id).toBe(group.id); expect(next.revision).toBe(2); expect(next.previousNames).toEqual([group.name]);
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(rawAccounts);
    expect(readAccountsState().accounts.find((entry) => entry.id === account.id)?.studentRecord).toEqual(account.studentRecord);
    expect(getAcademicGroupByName(group.name)?.id).toBe(group.id); expect(getAcademicGroupByName(next.name)?.id).toBe(group.id);
    expect(getAcademicGroupNameAt(group.id, "2026-10-19T08:00:00+03:00")).toBe(group.name);
    const schedule = getDemoWeekSchedule(new Date(2026, 9, 19));
    expect(schedule.find((entry) => entry.id === 808080)?.group).toBe(group.name);
    expect(getPersonalSchedule(schedule, { id: account.id, role: "student", memberships: [{ subjectId: "theory-of-probability", groupIds: [group.id] }] }).some((entry) => entry.id === 808080)).toBe(true);
    expect(readGroupCatalogState().history.at(-1)).toMatchObject({ action: "updated", before: { name: group.name, campus: 3 }, after: { name: next.name, campus: 9 } });
    expect(decodeGroupCatalog(values.get(GROUP_CATALOG_STORAGE_KEY)!)).toBeTruthy();
  });
  it("adopts initial group metadata without changing IDs, demo enrolment or offerings", async () => {
    const before = getSubjectGroups("theory-of-probability").map((group) => group.id);
    const next = await groupCatalogService.update({ ...actor, expectedRevision: 0, groupRevision: 0, groupId: "112-mko", draft: { ...draft, name: "212-МКо", course: 2 } });
    expect(next).toMatchObject({ id: "112-mko", source: "initial" });
    expect(ACADEMIC_GROUPS).toHaveLength(10); expect(getAcademicGroupByName("112-МКо")?.id).toBe("112-mko");
    expect(getSubjectGroups("theory-of-probability").map((group) => group.id)).toEqual(before);
    expect(getStudentGroupId(readAccountsState().accounts.find((entry) => entry.id === "anna-smirnova")!)).toBe("112-mko");
  });
  it("reserves historical names and archived names for the same group", async () => {
    let group = await create(); group = await groupCatalogService.update({ ...target(group), draft: { ...draft, name: "201-ИВТ" } }); await archive(group);
    for (const name of [draft.name, "２０１-ивт"]) await expect(groupCatalogService.create({ ...actor, expectedRevision: 3, draft: { ...draft, name } })).rejects.toThrow("существует");
  });
  it("blocks archive for studying students even if login is blocked", async () => {
    const group = await create(); const account = await student(group);
    await accountService.changeStatus({ ...actor, expectedRevision: 1, accountId: account.id, accountRevision: 1, status: "blocked" });
    const preview = await groupCatalogService.previewStatus(target(group));
    expect(preview.dependencies.students).toBe(1); expect(preview.blockers.join()).toContain("ещё учатся");
    await expect(archive(group)).rejects.toThrow("ещё учатся");
  });
  it.each(["graduated", "withdrawn"] as const)("keeps a %s student and permits archive without changing login access", async (status) => {
    const group = await create(); const account = await student(group); const changed = await enrollment(account.id, status);
    expect(changed.status).toBe(account.status); expect(changed.studentRecord).toEqual(account.studentRecord); expect(getStudentGroupId(changed)).toBe(group.id);
    const archived = await archive(group); expect(archived.status).toBe("archived");
    expect(readAccountsState().accounts.find((entry) => entry.id === account.id)?.enrollmentStatus).toBe(status);
    expect(readAccountsState().history.at(-1)?.changes).toContainEqual({ field: "enrollmentStatus", before: "studying", after: status });
  });
  it("rejects new enrolment, teaching, import, schedule writes and studying reactivation in an archive", async () => {
    const group = await create(); const account = await student(group); await enrollment(account.id, "graduated"); await archive(group);
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(student(group)).rejects.toThrow("архиве");
    await expect(enrollment(account.id, "studying")).rejects.toThrow("архиве");
    const teacher = readAccountsState().accounts[0];
    await expect(accountService.updateAssignments({ ...actor, expectedRevision: readAccountsState().revision, accountId: teacher.id, accountRevision: teacher.revision, memberships: [{ subjectId: "theory-of-probability", groupIds: [group.id] }] })).rejects.toThrow("Архивные");
    const preview = await accountService.previewStudentsImport({ ...actor, request: { defaultGroupId: group.id, defaultCampus: 3, rows: [{ line: 2, name: "Новый Студент", login: "import.new", group: "", campus: "", email: "" }] } });
    expect(preview.errors).toBe(1); expect(preview.rows[0].errors.join()).toContain("архиве");
    await expect(saveManagedScheduleDraft({ actorId: actor.actorId, expectedRevision: 0, groupId: group.id, weekStart: "2026-10-26", lessons: [] })).rejects.toThrow("архиве");
    await expect(publishManagedScheduleDraft({ actorId: actor.actorId, expectedRevision: 0, groupId: group.id, weekStart: "2026-10-26" })).rejects.toThrow("архиве");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before);
  });
  it("allows graduate contact edits in archive but requires active group for a new admission", async () => {
    const group = await create(); const account = await student(group); await enrollment(account.id, "graduated"); await archive(group);
    const state = readAccountsState(); const current = state.accounts.find((entry) => entry.id === account.id)!;
    const updated = await accountService.updateDetails({ ...actor, expectedRevision: state.revision, accountId: current.id, accountRevision: current.revision, details: { name: current.name, login: current.login, email: "graduate@example.test", memberships: current.memberships, studentGroupId: group.id, enrollmentStatus: "graduated" } });
    expect(updated.email).toBe("graduate@example.test");
  });
  it("restores the same ID and allows a new student without restoring assignments automatically", async () => {
    const group = await create(); const archived = await archive(group);
    const restored = await groupCatalogService.changeStatus({ ...await groupCatalogService.previewStatus(target(archived)), status: "active" });
    expect(restored.id).toBe(group.id); expect(restored.revision).toBe(3); expect((await student(restored)).studentGroupId).toBe(group.id);
    expect(readGroupCatalogState().history.map((entry) => entry.action)).toEqual(["created", "archived", "restored"]);
  });
  it("reports teacher assignments and future published/draft lessons, preserving past lessons", async () => {
    const group = await create(); const state = readAccountsState(); const teacher = state.accounts[0];
    await accountService.updateAssignments({ ...actor, expectedRevision: state.revision, accountId: teacher.id, accountRevision: teacher.revision, memberships: [{ subjectId: "theory-of-probability", groupIds: [group.id] }] });
    writeSchedule(group.id, "2099-10-19", true);
    const preview = await groupCatalogService.previewStatus(target(group));
    expect(preview.dependencies).toMatchObject({ teachingAssignments: 1, futurePublishedLessons: 1, draftLessons: 1 }); expect(preview.blockers).toHaveLength(3);
    const latestTeacher = readAccountsState().accounts[0]; await accountService.updateAssignments({ ...actor, expectedRevision: 1, accountId: teacher.id, accountRevision: latestTeacher.revision, memberships: [] });
    writeSchedule(group.id);
    const raw = values.get(MANAGED_SCHEDULE_KEY); const archived = await archive(group);
    expect(archived.status).toBe("archived"); expect(values.get(MANAGED_SCHEDULE_KEY)).toBe(raw);
  });
  it("rejects stale dependency previews and competing updates without losing the original group", async () => {
    const group = await create(); const preview = await groupCatalogService.previewStatus(target(group)); await student(group);
    await expect(groupCatalogService.changeStatus({ ...preview, status: "archived" })).rejects.toThrow("изменились");
    const command = target(group);
    const updates = await Promise.allSettled([groupCatalogService.update({ ...command, draft: { ...draft, name: "201-ИВТ" } }), groupCatalogService.update({ ...command, draft: { ...draft, name: "202-ИВТ" } })]);
    expect(updates.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1); expect(readGroupCatalogState().groups.filter((entry) => entry.id === group.id)).toHaveLength(1);
  });
  it.each([true, false])("serializes archive and admission without producing a studying student in archive: archive first %s", async (archiveFirst) => {
    const group = await create(); const preview = await groupCatalogService.previewStatus(target(group));
    const number = (await accountService.previewStudentNumber({ ...actor, campus: 3 })).number;
    const admit = () => accountService.create({ ...actor, expectedRevision: 0, expectedStudentNumber: number, draft: { name: "Студент Конкуренции", login: "concurrent.student", role: "student", studentGroupId: group.id, studentCampus: 3, memberships: [] } });
    const move = () => groupCatalogService.changeStatus({ ...preview, status: "archived" });
    const outcomes = await Promise.allSettled(archiveFirst ? [move(), admit()] : [admit(), move()]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const archived = readGroupCatalogState().managed[0].status === "archived";
    const admitted = readAccountsState().accounts.some((entry) => entry.login === "concurrent.student");
    expect(archived).toBe(archiveFirst); expect(admitted).toBe(!archiveFirst);
  });
  it("does not overwrite corrupt dependency data or a catalogue after a failed write", async () => {
    const group = await create(); const raw = values.get(GROUP_CATALOG_STORAGE_KEY);
    for (const key of [MANAGED_SCHEDULE_KEY, ACCOUNTS_STORAGE_KEY]) { values.set(key, "broken"); await expect(archive(group)).rejects.toThrow(); expect(values.get(key)).toBe("broken"); expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe(raw); values.delete(key); }
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: () => { throw new Error("Quota exceeded"); } });
    await expect(archive(group)).rejects.toThrow("Quota"); expect(values.get(GROUP_CATALOG_STORAGE_KEY)).toBe(raw);
  });
  it("reauthorizes updates and does not accept no-op changes or malformed status/history", async () => {
    const group = await create();
    await expect(groupCatalogService.update({ ...target(group), draft })).rejects.toThrow("не изменились");
    await expect(groupCatalogService.update({ ...target(group), actorId: "anna-smirnova", draft: { ...draft, name: "201-ИВТ" } })).rejects.toThrow("настройщик");
    const document = JSON.parse(values.get(GROUP_CATALOG_STORAGE_KEY)!); document.groups[0].status = "unknown";
    expect(() => decodeGroupCatalog(JSON.stringify(document))).toThrow("состояние");
  });
});
