import { describe, expect, it } from "vitest";
import { queryStudentRegistry, type StudentRegistryQuery } from "./studentRegistry";
import { createInitialAccountsDocument } from "../data/accountStore";
import type { PortalAccount } from "./accounts";

const groups = [{ id: "group-one", name: "201-ИВТ", previousNames: ["101-ИВТ"] }, { id: "group-two", name: "102-ИВТ", status: "archived" as const }];
const students: PortalAccount[] = [{ id: "a", name: "Анна Иванова", login: "anna.ivanova", role: "student", revision: 1, memberships: [], studentGroupId: "group-one", studentRecord: { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: "2026-10-26T10:00:00Z" } }, { id: "b", name: "Борис Сидоров", login: "boris.sidorov", role: "student", revision: 1, memberships: [], studentGroupId: "group-two", enrollmentStatus: "graduated", status: "blocked" }, { id: "c", name: "Вера Петрова", login: "vera.petrova", role: "student", revision: 1, memberships: [], studentGroupId: "group-one", enrollmentStatus: "withdrawn", studentRecord: { number: "202570001", year: 2025, campus: 7, sequence: 1, issuedAt: "2025-10-26T10:00:00Z" } }];
const query: StudentRegistryQuery = { q: "", group: "all", enrollment: "all", access: "all", campus: "all", year: "all", sort: "name", page: 1 };

describe("student registry query", () => {
  it("lists only students, independent learning/login states and immutable number metadata", () => {
    const result = queryStudentRegistry([...students, createInitialAccountsDocument().accounts[0]], groups, query);
    expect(result.totalStudents).toBe(3); expect(result.years).toEqual([2026, 2025]);
    expect(result.rows[0]).toMatchObject({ enrollment: "studying", access: "active", campus: 3, year: 2026 });
    expect(result.rows[1]).toMatchObject({ enrollment: "graduated", access: "blocked", groupArchived: true });
  });
  it.each(["Иванова Анна", "202630001", "anna.ivanova", "101-ИВТ"])("searches names, numbers, logins and previous group names: %s", (q) => {
    const result = queryStudentRegistry(students, groups, { ...query, q });
    expect(result.rows.some((row) => row.accountId === "a")).toBe(true);
  });
  it("combines filters and identifies old students without issued record numbers", () => {
    expect(queryStudentRegistry(students, groups, { ...query, enrollment: "graduated", access: "blocked", group: "group-two", campus: "unknown", year: "unknown" }).rows.map((row) => row.accountId)).toEqual(["b"]);
    expect(queryStudentRegistry(students, groups, { ...query, campus: "7", year: "2025" }).rows.map((row) => row.accountId)).toEqual(["c"]);
    expect(queryStudentRegistry(students, groups, { ...query, campus: "3", enrollment: "withdrawn" }).total).toBe(0);
    expect(queryStudentRegistry(students, groups, { ...query, group: "missing" }).total).toBe(0);
  });
  it("paginates and sorts consistently with stable tie breakers", () => {
    const many = Array.from({ length: 45 }, (_, index) => ({ ...students[0], id: `student-${String(index).padStart(2, "0")}`, name: `Студент ${index}` }));
    const before = JSON.stringify(many); const result = queryStudentRegistry(many, groups, { ...query, page: 3 });
    expect(result.rows).toHaveLength(5); expect(result.rows[0].name).toBe("Студент 40"); expect(result.pages).toBe(3);
    expect(queryStudentRegistry(many, groups, { ...query, page: 999 }).page).toBe(3); expect(queryStudentRegistry(many, groups, { ...query, page: NaN }).page).toBe(1);
    expect(queryStudentRegistry(students, groups, { ...query, sort: "number" }).rows.map((row) => row.accountId)).toEqual(["c", "a", "b"]);
    expect(JSON.stringify(many)).toBe(before);
  });
});
