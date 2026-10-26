import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, readAccountsState } from "./accountStore";
import { DEMO_SUBJECTS, refreshAcademicCatalog } from "./academicCatalog";
import { readSubjectCatalogState, subjectCatalogService, SUBJECT_CATALOG_STORAGE_KEY } from "./subjectCatalogStore";
import { getManagedWeekKey, MANAGED_SCHEDULE_KEY } from "../domain/scheduleManagement";
import { publishManagedScheduleDraft, saveManagedScheduleDraft } from "./managedScheduleStore";
import { createSubjectLessons } from "./lessons";
import { createDemoWeekSchedule } from "./demoSchedule";
import { createLearningDemo } from "./demo/learning";
import { getJournalSnapshot } from "./journalStore";

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

describe("created subjects across the portal", () => {
  it("publishes an assigned new subject without generating old classes, grades or demo assignments", async () => {
    const context = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0 };
    const legacyWeek = createDemoWeekSchedule(new Date(2026, 9, 19));
    const subject = await subjectCatalogService.create({ ...context, draft: { name: "Иностранный язык", shortName: "ИЯ" } });
    expect(readSubjectCatalogState().subjects.find((entry) => entry.id === subject.id)).toEqual(subject);
    expect(createSubjectLessons(subject.id, "112-mko")).toEqual([]);
    expect(createDemoWeekSchedule(new Date(2026, 9, 19))).toEqual(legacyWeek);
    expect(createLearningDemo(new Date(2026, 9, 19)).assignments.every((assignment) => DEMO_SUBJECTS.some((entry) => entry.id === assignment.subjectId))).toBe(true);
    const student = await accountService.create({ ...context, expectedStudentNumber: (await accountService.previewStudentNumber({ ...context, campus: 1 })).number, draft: { name: "Новый Студент", login: "new.student", role: "student", studentCampus: 1, memberships: [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }] } });
    const teacher = readAccountsState().accounts.find((account) => account.id === "teacher-elena-volkova")!;
    await accountService.updateAssignments({ ...context, expectedRevision: 1, accountId: teacher.id, accountRevision: teacher.revision, memberships: [...teacher.memberships, { subjectId: subject.id, groupIds: ["112-mko"] }] });
    const roster = getJournalSnapshot(subject.id, "112-mko");
    expect(roster.find((entry) => entry.id === student.id)).toMatchObject({ attendance: {}, grades: {} });
    expect(roster.every((entry) => Object.keys(entry.attendance).length === 0 && Object.keys(entry.grades).length === 0)).toBe(true);
    const weekStart = getManagedWeekKey("2099-10-19");
    const scope = { actorId: context.actorId, groupId: "112-mko", weekStart };
    const lesson = { id: "managed:new-subject", scheduleId: 800010, subjectId: subject.id, groupId: scope.groupId, teacherId: teacher.id, teacherName: teacher.name, date: weekStart, startsAt: "07:00", endsAt: "08:00", room: "QA-999", type: "practice" as const };
    await saveManagedScheduleDraft({ ...scope, expectedRevision: 0, lessons: [lesson] });
    expect(createSubjectLessons(subject.id, scope.groupId)).toEqual([]);
    await publishManagedScheduleDraft({ ...scope, expectedRevision: 1 });
    expect(createSubjectLessons(subject.id, scope.groupId)).toMatchObject([{ id: lesson.id, type: "practice", state: "scheduled" }]);
    expect(getJournalSnapshot(subject.id, scope.groupId).every((entry) => Object.keys(entry.attendance).length === 0 && Object.keys(entry.grades).length === 0)).toBe(true);
  });
  it("refuses timetable writes when the subject catalog is unreadable without modifying either source", async () => {
    const scope = { actorId: "configurator-demo", expectedRevision: 0, groupId: "112-mko", weekStart: "2026-10-19", lessons: [] };
    await saveManagedScheduleDraft(scope);
    const before = values.get(MANAGED_SCHEDULE_KEY);
    values.set(SUBJECT_CATALOG_STORAGE_KEY, "damaged subject catalog");
    await expect(publishManagedScheduleDraft({ ...scope, expectedRevision: 1 })).rejects.toThrow("Каталог дисциплин недоступен");
    await expect(saveManagedScheduleDraft({ ...scope, expectedRevision: 1 })).rejects.toThrow("Каталог дисциплин недоступен");
    expect(values.get(MANAGED_SCHEDULE_KEY)).toBe(before);
    expect(values.get(SUBJECT_CATALOG_STORAGE_KEY)).toBe("damaged subject catalog");
  });
});
