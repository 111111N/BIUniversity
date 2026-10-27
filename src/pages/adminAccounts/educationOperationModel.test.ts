import { describe, expect, it } from "vitest";
import { getStudentGroupId, type PortalAccount } from "../../domain/accounts";
import type { StudentEducationEvent } from "../../domain/studentEducationEvent";
import { hasEducationDetailsChanges } from "../../components/EducationEventFields/presentation";
import { getEducationOperationProblem, getEducationOperationRestriction, getEducationOperations, prepareEducationOperation } from "./educationOperationModel";

const student: PortalAccount = { id: "student", name: "Студент", login: "student", role: "student", revision: 1, memberships: [], studentGroupId: "g1", enrollmentStatus: "studying", status: "blocked" };
const groups = [{ id: "g1", name: "112-МКо" }, { id: "g2", name: "113-МКо" }, { id: "old", name: "Архив", status: "archived" as const }];
const details = { effectiveDate: "2026-10-27", basis: "Приказ ректора", documentNumber: "15-У", documentDate: "2026-10-26" };
const now = "2026-10-27T10:00:00Z";
const last: StudentEducationEvent = { ...details, id: "event", accountId: student.id, actorId: "admin", registeredAt: now, kind: "admitted", after: { groupId: "g1", groupName: "112-МКо", enrollment: "studying" }, accountRevisionAfter: 1, auditId: "audit" };

describe("individual education operations", () => {
  it("preserves existing transitions, including changes between completed states", () => {
    expect(getEducationOperations(student)).toEqual(["transfer", "graduate", "withdraw"]);
    expect(getEducationOperations({ ...student, enrollmentStatus: "graduated" })).toEqual(["reinstate", "withdraw"]);
    expect(getEducationOperations({ ...student, enrollmentStatus: "withdrawn" })).toEqual(["reinstate", "graduate"]);
    expect(getEducationOperations({ ...student, role: "teacher" })).toEqual([]);
  });

  it("starts each operation from original education, discarding a prior transfer without mutating its source", () => {
    const original = { ...student, memberships: [{ subjectId: "math", groupIds: ["g1"] }] };
    const draft = { ...original, studentGroupId: "g2", studentCampus: 3, enrollmentStatus: "withdrawn" as const };
    const before = structuredClone({ original, draft });
    const result = prepareEducationOperation(original, draft, "graduate");
    expect(result).toMatchObject({ studentGroupId: "g1", enrollmentStatus: "graduated", studentCampus: undefined });
    result.memberships[0].groupIds.push("independent");
    expect({ original, draft }).toEqual(before);
    expect(prepareEducationOperation(original, draft, null).enrollmentStatus).toBe("studying");
  });

  it("retains inferred legacy group until an actual transfer is selected", () => {
    const legacy = { ...student, studentGroupId: undefined, memberships: [{ subjectId: "math", groupIds: ["g1"] }] };
    const draft = prepareEducationOperation(legacy, { ...legacy, memberships: [] }, "graduate");
    expect(getStudentGroupId(draft)).toBe("g1");
    expect(getEducationOperationProblem(legacy, draft, "graduate", details, [], groups, now)).toBe("");
  });

  it("requires an actual active target group and keeps enrollment unchanged during transfer", () => {
    const draft = prepareEducationOperation(student, student, "transfer");
    expect(getEducationOperationProblem(student, draft, "transfer", details, [], groups, now)).toContain("другую учебную группу");
    expect(getEducationOperationProblem(student, { ...draft, studentGroupId: "old" }, "transfer", details, [], groups, now)).toContain("действующую");
    expect(getEducationOperationProblem(student, { ...draft, studentGroupId: "missing" }, "transfer", details, [], groups, now)).toContain("действующую");
    expect(getEducationOperationProblem(student, { ...draft, studentGroupId: "g2" }, "transfer", details, [], groups, now)).toBe("");
    expect(getEducationOperationProblem(student, { ...draft, studentGroupId: "g2", enrollmentStatus: "graduated" }, "transfer", details, [], groups, now)).toContain("отдельными действиями");
  });

  it("does not combine graduation and transfer or resume inside an archived group", () => {
    const draft = prepareEducationOperation(student, student, "graduate");
    expect(getEducationOperationProblem(student, { ...draft, studentGroupId: "g2" }, "graduate", details, [], groups, now)).toContain("отдельными действиями");
    const archived = { ...student, studentGroupId: "old", enrollmentStatus: "withdrawn" as const };
    expect(getEducationOperationRestriction(archived, "reinstate", groups)).toContain("Сначала восстановите группу");
    expect(getEducationOperationRestriction(archived, "graduate", groups)).toBe("");
    expect(getEducationOperationRestriction(archived, "transfer", groups)).toContain("текущему состоянию");
    expect(getEducationOperationRestriction({ ...student, studentGroupId: "missing" }, "graduate", groups)).toContain("группа недоступна");
  });

  it("uses domain date, basis, document and event continuity checks before review", () => {
    const draft = prepareEducationOperation(student, student, "withdraw");
    const problem = (value = details, events = [last]) => getEducationOperationProblem(student, draft, "withdraw", value, events, groups, now);
    expect(problem()).toBe("");
    expect(problem({ ...details, effectiveDate: "2026-10-28" })).toContain("прошедший день");
    expect(problem({ ...details, effectiveDate: "2026-10-26" })).toContain("раньше последнего события");
    expect(problem({ ...details, basis: " " })).toContain("основание");
    expect(problem({ ...details, documentDate: "2026-10-28" })).toContain("дату документа");
    expect(problem(details, [{ ...last, after: { ...last.after, groupId: "g2" } }])).toContain("расходится");
    expect(getEducationOperationProblem(student, student, null, details, [], groups, now)).toContain("Выберите действие");
  });

  it("protects typed event details before a transfer target has been selected", () => {
    const baseline = { effectiveDate: details.effectiveDate, basis: "" };
    const draft = prepareEducationOperation(student, student, "transfer");
    expect(getStudentGroupId(draft)).toBe(getStudentGroupId(student));
    expect(hasEducationDetailsChanges({ ...baseline, basis: "Приказ" }, baseline)).toBe(true);
    expect(hasEducationDetailsChanges({ ...baseline, documentNumber: "15-У" }, baseline)).toBe(true);
    expect(hasEducationDetailsChanges({ ...baseline, effectiveDate: "2026-10-26" }, baseline)).toBe(true);
    expect(hasEducationDetailsChanges({ ...baseline, documentNumber: "", documentDate: "" }, baseline)).toBe(false);
  });
});
