import { describe, expect, it } from "vitest";
import { withCreatedSubjectMemberships } from "./studentMemberships";
import type { CurrentUser } from "./accounts";

const student: CurrentUser = { id: "student", name: "Student", role: "student", memberships: [{ subjectId: "old", groupIds: ["group-1"] }] };
const teacher = (subjectId: string, groupId = "group-1"): CurrentUser => ({ id: "teacher", name: "Teacher", role: "teacher", memberships: [{ subjectId, groupIds: [groupId] }] });

describe("existing students and created disciplines", () => {
  it("projects the first discipline from independent enrolment without inventing other subjects", () => {
    const enrolled = { ...student, studentGroupId: "group-1", memberships: [] };
    expect(withCreatedSubjectMemberships(enrolled, [teacher("first"), teacher("other", "group-2")], new Set(["first", "other"])).memberships).toEqual([{ subjectId: "first", groupIds: ["group-1"] }]);
    expect(enrolled.memberships).toEqual([]);
    expect(withCreatedSubjectMemberships(enrolled, [], new Set(["first"]))).toBe(enrolled);
  });
  it("makes a new teaching assignment available to existing students of the group without rewriting their account", () => {
    expect(withCreatedSubjectMemberships(student, [teacher("new"), teacher("new")], new Set(["new"])).memberships).toEqual([...student.memberships, { subjectId: "new", groupIds: ["group-1"] }]);
    expect(student.memberships).toHaveLength(1);
  });
  it("does not grant another group's subject, an unassigned subject, or change legacy curriculum", () => {
    expect(withCreatedSubjectMemberships(student, [teacher("new", "group-2"), teacher("legacy-other")], new Set(["new", "unassigned"]))).toBe(student);
  });
  it("does not copy teacher privileges or duplicate already stored student memberships", () => {
    const currentTeacher = teacher("new");
    expect(withCreatedSubjectMemberships(currentTeacher, [currentTeacher], new Set(["new"]))).toBe(currentTeacher);
    const assigned = { ...student, memberships: [...student.memberships, { subjectId: "new", groupIds: ["group-1"] }] };
    expect(withCreatedSubjectMemberships(assigned, [currentTeacher], new Set(["new"]))).toBe(assigned);
  });
});
