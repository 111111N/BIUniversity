import { describe, expect, it } from "vitest";
import { queryTeacherRegistry, type TeacherRegistryQuery } from "./teacherRegistry";
import type { PortalAccount } from "./accounts";

const subjects = [{ id: "math", name: "Математика", shortName: "МАТ" }, { id: "physics", name: "Физика", shortName: "ФИЗ" }];
const groups = [{ id: "a", name: "101-ИВТ", previousNames: ["100-ИВТ"] }, { id: "b", name: "102-ИВТ" }];
const teacher = (id: string, patch: Partial<PortalAccount> = {}): PortalAccount => ({ id, name: `Преподаватель ${id}`, login: `teacher.${id}`, role: "teacher", revision: 1, memberships: [], ...patch });
const assigned = teacher("1", { name: "Семён Петров", email: "petrov@university.ru", memberships: [{ subjectId: "math", groupIds: ["a", "b"] }, { subjectId: "physics", groupIds: ["b"] }] });
const blocked = teacher("2", { status: "blocked", memberships: [{ subjectId: "math", groupIds: ["a"] }] });
const accounts = [assigned, blocked, teacher("3"), teacher("student", { role: "student" })];
const read = (patch: Partial<TeacherRegistryQuery> = {}, source = accounts) => queryTeacherRegistry(source, subjects, groups, { q: "", subject: "all", group: "all", access: "all", assignments: "all", page: 1, ...patch });

describe("teacher registry", () => {
  it("includes blocked teachers, omits other roles and counts unique groups", () => {
    const result = read();
    expect(result).toMatchObject({ totalTeachers: 3, withoutAssignments: 1, total: 3 });
    expect(result.rows.find((row) => row.accountId === "1")).toMatchObject({ access: "active", subjectCount: 2, groupCount: 2 });
    expect(result.rows.find((row) => row.accountId === "2")?.access).toBe("blocked");
  });
  it("requires subject and group to belong to the same assignment", () => {
    expect(read({ subject: "physics", group: "a" }).total).toBe(0);
    expect(read({ subject: "physics", group: "b" }).rows.map((row) => row.accountId)).toEqual(["1"]);
  });
  it("searches all terms in any order with ё/е, logins, contacts and group aliases", () => {
    expect(read({ q: "Петров семен" }).total).toBe(1);
    expect(read({ q: "petrov@university.ru" }).total).toBe(1);
    expect(read({ q: "ФИЗ 100-ивт" }).rows[0].accountId).toBe("1");
    expect(read({ q: "teacher.3" }).rows[0].accountId).toBe("3");
  });
  it("keeps global no-assignment totals independent of filters and access", () => {
    expect(read({ access: "blocked" })).toMatchObject({ total: 1, withoutAssignments: 1 });
    expect(read({ assignments: "none" }).rows.map((row) => row.accountId)).toEqual(["3"]);
    expect(read({ assignments: "assigned", access: "active" }).rows.map((row) => row.accountId)).toEqual(["1"]);
    expect(read({ assignments: "none", subject: "math" }).total).toBe(0);
  });
  it("bounds pages and returns only three subject previews without losing counts", () => {
    const source = Array.from({ length: 1000 }, (_, index) => teacher(String(index)));
    expect(read({ page: 2 }, source)).toMatchObject({ total: 1000, pages: 50, page: 2 });
    expect(read({ page: 2 }, source).rows).toHaveLength(20);
    expect(read({ page: 9999 }, source).page).toBe(50);
    expect(read({ page: NaN }, source).page).toBe(1);
    expect(read({ q: "no such teacher", page: 99 })).toMatchObject({ rows: [], page: 1, pages: 1 });
    const many = teacher("many", { memberships: Array.from({ length: 100 }, (_, index) => ({ subjectId: `subject-${index}`, groupIds: ["a"] })) });
    expect(read({}, [many]).rows[0]).toMatchObject({ subjectCount: 100, groupCount: 1 });
    expect(read({}, [many]).rows[0].subjects).toHaveLength(3);
  });
  it("reads missing catalog references without changing source data", () => {
    const source = [teacher("legacy", { memberships: [{ subjectId: "missing", groupIds: ["unknown"] }, { subjectId: "empty", groupIds: [] }] })];
    const snapshot = structuredClone(source);
    expect(read({ q: "unknown" }, source).rows[0]).toMatchObject({ subjectCount: 1, groupCount: 1, subjects: [{ id: "missing", name: "missing" }] });
    expect(source).toEqual(snapshot);
  });
});
