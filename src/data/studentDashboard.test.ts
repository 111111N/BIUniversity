import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStudentDashboard, getTeacherDashboard } from "./studentDashboard";
import { refreshAcademicCatalog } from "./academicCatalog";
import { journalKey } from "./journalStore";
import { MANAGED_SCHEDULE_KEY } from "../domain/scheduleManagement";
import { ACCOUNTS_STORAGE_KEY } from "./accountStore";

const assignmentsKey = "bi-university-demo-assignments";
const submissionsKey = "bi-university-demo-submissions";
const memberships = [{ subjectId: "theory-of-probability", groupIds: ["112-mko"] }];
const now = new Date(2026, 9, 29, 12);
const task = { id: "task", subjectId: memberships[0].subjectId, groupId: "112-mko", subject: "Теория вероятностей", group: "112-МКо", title: "Сохранённое задание", description: "Условие", lessonDate: "2026-10-29T09:00", lessonType: "Практика", deadline: "2026-10-30T23:59", status: "published", allowLateSubmissions: false, createdAt: "2026-10-28T12:00", updatedAt: "2026-10-28T12:00" };
let values: Map<string, string>;
let denied: string | null;
let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };
const student = () => getStudentDashboard({ studentId: "anna-smirnova", memberships, now });
const teacher = () => getTeacherDashboard({ memberships, now });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  values = new Map([[assignmentsKey, JSON.stringify([task])], [submissionsKey, "[]"]]); denied = null;
  storage = { getItem: vi.fn((key: string) => { if (key === denied) throw new Error("Read denied"); return values.get(key) ?? null; }), setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal("localStorage", storage);
  vi.spyOn(console, "error").mockImplementation(() => {});
  refreshAcademicCatalog();
});
afterEach(() => { values.clear(); denied = null; refreshAcademicCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("dashboard source failures", () => {
  it.each([assignmentsKey, submissionsKey])("does not turn unreadable %s into a successful empty summary", (key) => {
    values.set(key, "not-json");
    const result = student();
    expect(result.errors.assignments).toBeTruthy();
    expect(result.tasks).toEqual([]);
    expect(result.activeAssignments).toBeNull();
    expect(result.awaitingReview).toBeNull();
    expect(result.errors.journal).toBe("");
    expect(result.attendance).not.toBeNull();
    expect(result.weekLessons).toBeGreaterThan(0);
    const staff = teacher();
    expect(staff.errors.assignments).toBeTruthy();
    expect(staff.focus.some((item) => item.title.includes("пока нет ответов"))).toBe(false);
    expect(staff.attendanceMarked).not.toBeNull();
  });

  it("distinguishes missing initial storage and an intentionally empty assignment list", () => {
    values.delete(assignmentsKey); values.delete(submissionsKey);
    expect(student().errors.assignments).toBe("");
    expect(student().tasks.some((item) => item.id === "linear-algebra-rgr-2")).toBe(true);
    values.set(assignmentsKey, "[]");
    const empty = student();
    expect(empty.tasks).toEqual([]);
    expect(empty.activeAssignments).toBe(0);
    expect(empty.awaitingReview).toBe(0);
    expect(empty.errors.assignments).toBe("");
  });

  it("does not replace a damaged journal with demo marks or a partial average", () => {
    values.set(journalKey(memberships[0].subjectId, "112-mko"), "{}");
    const result = student();
    expect(result.errors.journal).toBeTruthy();
    expect(result.attendance).toBeNull();
    expect(result.averageGrade).toBeNull();
    expect(result.gradesCount).toBeNull();
    expect(result.activeAssignments).toBe(1);
    expect(result.weekLessons).toBeGreaterThan(0);
    const staff = teacher();
    expect(staff.attendanceMarked).toBeNull();
    expect(staff.journalCells).toBeNull();
    expect(staff.focus.some((item) => item.title.includes("пока нет ответов"))).toBe(true);
    expect(staff.focus.some((item) => item.title.includes("не заполнено"))).toBe(false);
  });

  it("keeps independent assignments when schedule-dependent statistics cannot be calculated", () => {
    values.set(MANAGED_SCHEDULE_KEY, "{}");
    const result = student();
    expect(result.errors.schedule).toBeTruthy();
    expect(result.errors.journal).toBeTruthy();
    expect(result.weekLessons).toBeNull();
    expect(result.todayLessons).toBeNull();
    expect(result.attendance).toBeNull();
    expect(result.activeAssignments).toBe(1);
    expect(teacher().conductedLessons).toBeNull();
  });

  it("does not calculate a journal roster from an unreadable account list", () => {
    values.set(ACCOUNTS_STORAGE_KEY, "{}");
    const result = student();
    expect(result.errors.journal).toBeTruthy();
    expect(result.attendance).toBeNull();
    expect(result.activeAssignments).toBe(1);
  });

  it("recovers after storage access is restored without replacing any saved data", () => {
    const before = [...values];
    denied = submissionsKey;
    expect(student().activeAssignments).toBeNull();
    denied = null;
    const recovered = student();
    expect(recovered.errors).toEqual({ assignments: "", journal: "", schedule: "" });
    expect(recovered.activeAssignments).toBe(1);
    expect(recovered.tasks[0].title).toBe(task.title);
    expect([...values]).toEqual(before);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
