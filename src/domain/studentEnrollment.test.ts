import { describe, expect, it } from "vitest";
import { countRegisteredStudentsByGroup, getStudentGroupId, validateAccountDraft, type AccountDraft, type CurrentUser } from "./accounts";
import { isStudyingStudent, isStudentEnrollmentStatus } from "./studentEnrollment";

const draft: AccountDraft = { name: "Новый Студент", login: "new.student", role: "student", memberships: [], studentGroupId: "group-new" };
describe("independent student enrolment", () => {
  it("allows an empty curriculum while requiring one actual group identity", () => {
    expect(validateAccountDraft(draft, [])).toMatchObject({ studentGroupId: "group-new", memberships: [] });
    expect(() => validateAccountDraft({ ...draft, studentGroupId: undefined }, [])).toThrow("группу");
    expect(() => validateAccountDraft({ ...draft, memberships: [{ subjectId: "math", groupIds: ["group-other"] }] }, [])).toThrow("одной");
  });
  it("reads old one-group accounts and rejects ambiguous legacy groups", () => {
    expect(getStudentGroupId({ role: "student", memberships: [{ subjectId: "a", groupIds: ["old"] }, { subjectId: "b", groupIds: ["old"] }] })).toBe("old");
    expect(getStudentGroupId({ role: "student", memberships: [{ subjectId: "a", groupIds: ["old", "other"] }] })).toBeUndefined();
    expect(getStudentGroupId({ ...draft, role: "teacher" })).toBeUndefined();
  });
  it("counts registered students independently of their curriculum and login access", () => {
    const student: CurrentUser = { ...draft, id: "one" };
    expect(countRegisteredStudentsByGroup([student, { ...student, id: "two", status: "blocked" }, { ...student, id: "teacher", role: "teacher" }]).get("group-new")).toBe(2);
  });
  it("defaults legacy students to studying and keeps login access independent of learning state", () => {
    expect(isStudyingStudent({ ...draft, id: "student", status: "blocked" } as CurrentUser)).toBe(true);
    expect(isStudyingStudent({ role: "student", enrollmentStatus: "graduated" })).toBe(false);
    expect(isStudyingStudent({ role: "student", enrollmentStatus: "withdrawn" })).toBe(false);
    expect(isStudyingStudent({ role: "teacher" })).toBe(false);
    expect(isStudentEnrollmentStatus("unknown")).toBe(false);
    expect(isStudentEnrollmentStatus("toString")).toBe(false);
  });
});
