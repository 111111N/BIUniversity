import { describe, expect, it } from "vitest";
import { getAccountIdentityErrors, getMissingStudentGroupProblem, validateAccountDraft, type AccountDraft } from "./accounts";
import { createInitialAccountsDocument } from "../data/accountStore";

const draft: AccountDraft = { name: "Новый Студент", login: "new.student", email: "student@example.test", role: "teacher", memberships: [] };
const accounts = createInitialAccountsDocument().accounts;

describe("shared account identity validation", () => {
  it("returns all field problems without changing source values or accounts", () => {
    const invalid = { ...draft, name: " ", login: ".bad", email: "broken" };
    const original = structuredClone({ invalid, accounts });
    expect(getAccountIdentityErrors(invalid, accounts).map((problem) => problem.field)).toEqual(["name", "login", "email"]);
    expect({ invalid, accounts }).toEqual(original);
    expect(() => validateAccountDraft(invalid, accounts)).toThrow(getAccountIdentityErrors(invalid, accounts)[0].message);
  });
  it.each([
    { name: "А" }, { name: "А".repeat(121) },
    { login: "ab" }, { login: "a".repeat(65) }, { login: "-student" }, { login: "русский" },
    { login: "ＡＮＮＡ.ＳＭＩＲＮＯＶＡ" },
    { email: "student@example" }, { email: "a b@example.test" }, { email: `${"a".repeat(245)}@example.test` },
  ])("uses the service's existing rejection and message for %j", (patch) => {
    const invalid = { ...draft, ...patch };
    const problems = getAccountIdentityErrors(invalid, accounts);
    expect(problems).toHaveLength(1);
    expect(() => validateAccountDraft(invalid, accounts)).toThrow(problems[0].message);
  });
  it.each([
    { name: "Ая" }, { name: "А".repeat(120) }, { name: "  Новый    Студент  " },
    { login: "a_b" }, { login: "a".repeat(64) }, { login: " Ｎｅｗ.Ｓｔｕｄｅｎｔ " },
    { email: undefined }, { email: "  " }, { email: " STUDENT@EXAMPLE.TEST " }, { email: `${"a".repeat(241)}@example.test` },
  ])("preserves service acceptance at boundaries and after normalization for %j", (patch) => {
    const valid = { ...draft, ...patch };
    expect(getAccountIdentityErrors(valid, accounts)).toEqual([]);
    expect(() => validateAccountDraft(valid, accounts)).not.toThrow();
  });
  it("allows the edited account's login and detects another account even with the exclusion", () => {
    const student = accounts.find((account) => account.id === "anna-smirnova")!;
    expect(getAccountIdentityErrors(student, accounts, student.id)).toEqual([]);
    const another = { ...student, login: accounts[0].login };
    expect(getAccountIdentityErrors(another, accounts, student.id)).toEqual([{ field: "login", message: "Этот логин уже занят." }]);
    expect(() => validateAccountDraft(another, accounts, student.id)).toThrow("Этот логин уже занят.");
  });
  it("does not change validation priority for role, education or assignment problems", () => {
    const student = { ...draft, role: "student" as const, email: "broken" };
    expect(getAccountIdentityErrors(student, accounts)).toEqual([{ field: "email", message: "Укажите корректную электронную почту." }]);
    expect(() => validateAccountDraft(student, accounts)).toThrow("Выберите учебную группу студента.");
  });
  it("shares the missing student group requirement without rejecting legacy single-group assignments", () => {
    const student = { ...draft, role: "student" as const };
    const problem = getMissingStudentGroupProblem(student);
    expect(problem).toBe("Выберите учебную группу студента.");
    expect(() => validateAccountDraft(student, accounts)).toThrow(problem);
    expect(getMissingStudentGroupProblem({ ...student, studentGroupId: "112-mko" })).toBe("");
    expect(getMissingStudentGroupProblem({ ...student, memberships: [{ subjectId: "math", groupIds: ["112-mko"] }] })).toBe("");
    expect(getMissingStudentGroupProblem(draft)).toBe("");
  });
});
