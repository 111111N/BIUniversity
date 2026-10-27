import { describe, expect, it } from "vitest";
import { queryAdministrationChecks, type AdministrationChecksQuery } from "./administrationChecks";
import type { PortalAccount } from "./accounts";
import type { ManagedLesson } from "./scheduleManagement";

const now = "2026-10-27T10:00:00Z";
const groups = [{ id: "a", name: "101-ИВТ" }, { id: "b", name: "102-ИВТ" }, { id: "archived", name: "Архивная", status: "archived" as const }];
const subjects = [{ id: "math", name: "Математика", shortName: "МАТ" }];
const teacher: PortalAccount = { id: "teacher", role: "teacher", name: "Семён Петров", login: "petrov", revision: 1, memberships: [{ subjectId: "math", groupIds: ["a"] }] };
const student: PortalAccount = { id: "student", role: "student", name: "Анна Смирнова", login: "anna", revision: 1, memberships: [], studentGroupId: "a" };
const lesson: ManagedLesson = { id: "managed:lesson", scheduleId: 100, groupId: "a", subjectId: "math", teacherId: "teacher", teacherName: teacher.name, date: "2026-10-28", startsAt: "09:00", endsAt: "10:30", room: "305", type: "lecture" };
const query = (patch: Partial<AdministrationChecksQuery> = {}): AdministrationChecksQuery => ({ q: "", kind: "all", level: "all", page: 1, ...patch });
const read = (accounts: PortalAccount[] = [teacher, student], lessons: ManagedLesson[] = [], patch: Partial<AdministrationChecksQuery> = {}, instant = now) => queryAdministrationChecks(accounts, groups, subjects, [{ groupId: "a", weekStart: "2026-10-26", lessons }], query(patch), instant);

describe("administrative data checks", () => {
  it("counts only real studying students and does not treat a blocked student's login as leaving the group", () => {
    const result = read([teacher, { ...student, status: "blocked" }]);
    expect(result.kinds["empty-group"]).toBe(1);
    expect(result.rows.filter((row) => row.kind === "empty-group").map((row) => row.groupId)).toEqual(["b"]);
    expect(result.kinds["student-number"]).toBe(1);
    expect(read([teacher, { ...student, studentRecord: { number: "202610001", year: 2026, campus: 1, sequence: 1, issuedAt: now } }]).kinds["student-number"]).toBe(0);
    expect(read([teacher, { ...student, enrollmentStatus: "graduated" }]).kinds).toMatchObject({ "empty-group": 2, "student-number": 0 });
  });
  it("infers the single legacy student group without creating fake members or counting archived groups", () => {
    const legacy = { ...student, studentGroupId: undefined, memberships: [{ subjectId: "math", groupIds: ["b"] }] };
    expect(read([teacher, legacy]).rows.filter((row) => row.kind === "empty-group").map((row) => row.groupId)).toEqual(["a"]);
    expect(read([]).kinds["empty-group"]).toBe(2);
  });
  it("requires an active teacher assigned to an active group for the subject", () => {
    expect(read([teacher]).kinds["unassigned-subject"]).toBe(0);
    expect(read([{ ...teacher, status: "blocked" }]).kinds["unassigned-subject"]).toBe(1);
    expect(read([{ ...teacher, role: "configurator" }]).kinds["unassigned-subject"]).toBe(1);
    expect(read([{ ...teacher, memberships: [{ subjectId: "math", groupIds: ["archived"] }] }]).kinds["unassigned-subject"]).toBe(1);
    expect(read([{ ...teacher, memberships: [{ subjectId: "math", groupIds: [] }] }]).kinds["unassigned-subject"]).toBe(1);
  });
  it("reports current and upcoming publications only, using the Moscow end time", () => {
    const blocked = { ...teacher, status: "blocked" as const };
    const today = { ...lesson, date: "2026-10-27" };
    expect(read([blocked], [today], {}, "2026-10-27T07:29:59Z").kinds["published-lesson"]).toBe(1);
    expect(read([blocked], [today], {}, "2026-10-27T07:30:00Z").kinds["published-lesson"]).toBe(0);
    expect(read([blocked], [{ ...lesson, date: "2026-10-26" }]).kinds["published-lesson"]).toBe(0);
    expect(read([teacher], [lesson]).kinds["published-lesson"]).toBe(0);
  });
  it("detects a missing or reassigned teacher and removed subject/group references", () => {
    expect(read([], [lesson]).rows.find((row) => row.kind === "published-lesson")?.detail).toContain("недоступна или её тип изменён");
    expect(read([{ ...teacher, memberships: [] }], [lesson]).rows.find((row) => row.kind === "published-lesson")?.detail).toContain("больше не назначен");
    const missing = read([teacher], [{ ...lesson, groupId: "missing", subjectId: "missing" }]).rows.find((row) => row.kind === "published-lesson");
    expect(missing?.groupId).toBeUndefined();
    expect(missing?.detail).toContain("Группа недоступна");
    expect(missing?.detail).toContain("Дисциплина недоступна");
    expect(read([teacher], [{ ...lesson, groupId: "archived" }]).kinds["published-lesson"]).toBe(1);
    expect(read([teacher], [{ ...lesson, groupId: "archived" }]).rows.find((row) => row.kind === "published-lesson")).toMatchObject({ groupId: "archived", groupArchived: true });
  });
  it("keeps global counters independent of filters and searches words in any order with ё/е", () => {
    const source = [{ ...teacher, status: "blocked" as const }, student];
    const all = read(source, [lesson]);
    const filtered = read(source, [lesson], { q: "петров семен", kind: "published-lesson", level: "action" });
    expect(filtered.total).toBe(1); expect(filtered.counts).toEqual(all.counts); expect(filtered.kinds).toEqual(all.kinds);
    expect(read(source, [lesson], { q: "petrov", kind: "published-lesson" }).total).toBe(1);
    expect(read(source, [lesson], { q: "anna" }).rows[0].accountId).toBe("student");
    expect(read(source, [lesson], { level: "review" }).rows.every((row) => row.level === "review")).toBe(true);
  });
  it("paginates large registries and does not mutate input data", () => {
    const largeGroups = Array.from({ length: 100 }, (_, index) => ({ id: `g${index}`, name: `Группа ${index}` }));
    const accounts = Array.from({ length: 10000 }, (_, index) => ({ ...student, id: `s${index}`, name: `Студент ${index}`, login: `student.${index}`, studentGroupId: `g${index % 100}` }));
    const before = JSON.stringify(accounts);
    const result = queryAdministrationChecks(accounts, largeGroups, [], [], query({ page: 2 }), now);
    expect(result).toMatchObject({ total: 10000, pages: 500, page: 2, counts: { action: 10000, review: 0 } });
    expect(result.rows).toHaveLength(20); expect(JSON.stringify(accounts)).toBe(before);
    expect(queryAdministrationChecks(accounts, largeGroups, [], [], query({ page: 9999 }), now).page).toBe(500);
    expect(queryAdministrationChecks(accounts, largeGroups, [], [], query({ page: NaN, q: "no matches" }), now)).toMatchObject({ rows: [], page: 1, pages: 1 });
  });
  it("orders actionable findings first and refuses an invalid check time", () => {
    const rows = read().rows;
    expect(rows[0].level).toBe("action"); expect(rows.at(-1)?.level).toBe("review");
    expect(() => read([], [], {}, "bad date")).toThrow("время проверки");
  });
});
