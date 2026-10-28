import { describe, expect, it } from "vitest";
import type { PortalAccount } from "../../domain/accounts";
import { accountDetailsDraftFrom } from "./accountDetailsRefresh";
import { getEducationOperationProblem, prepareEducationOperation } from "./educationOperationModel";
import type { EducationRefreshEditor, EducationRefreshSource } from "./educationRefresh";
import { applyEducationSwitch, prepareEducationSwitch } from "./educationOperationSwitch";

const student: PortalAccount = { id: "student", name: "Студент", login: "student", revision: 1, role: "student", memberships: [], studentGroupId: "g1", status: "blocked" };
const admin: PortalAccount = { id: "admin", name: "Настройщик", login: "admin", revision: 1, role: "configurator", memberships: [] };
const source = (): EducationRefreshSource => ({ accounts: structuredClone([student, admin]), revision: 0, actorId: admin.id, educationEvents: [], groups: [{ id: "g1", name: "112-МКо" }, { id: "g2", name: "113-МКо" }], groupRevision: 0 });
const editor = (): EducationRefreshEditor => ({ account: structuredClone(student), draft: prepareEducationOperation(student, accountDetailsDraftFrom(student), "graduate"), baseline: JSON.stringify(accountDetailsDraftFrom(student)), educationOperation: "graduate", education: { effectiveDate: "2026-10-25", basis: "Мой приказ", documentNumber: "15-У", documentDate: "2026-10-20" }, educationBaseline: { effectiveDate: "2026-10-28", basis: "" }, actorId: admin.id, actorRevision: 1, revision: 0, educationGroupRevision: 0 });

describe("switching an unfinished education action", () => {
  it("keeps the complete document and dirty baseline when switching completed-state operations", () => {
    const input = editor(); const latest = source(); const original = structuredClone({ input, latest });
    const review = prepareEducationSwitch(input, "withdraw", latest);
    expect(review.discardedGroup).toBe("");
    const next = applyEducationSwitch(input, review, latest);
    expect(next.education).toEqual(input.education); expect(next.educationBaseline).toEqual(input.educationBaseline); expect(next.baseline).toBe(input.baseline);
    expect(next.educationOperation).toBe("withdraw"); expect(next.draft).toMatchObject({ studentGroupId: "g1", enrollmentStatus: "withdrawn", studentCampus: undefined });
    expect(next.account.status).toBe("blocked"); expect({ input, latest }).toEqual(original);
  });
  it("identifies the exact transfer target that needs explicit discard approval", () => {
    const input = editor(); input.educationOperation = "transfer"; input.draft = { ...accountDetailsDraftFrom(student), studentGroupId: "g2" };
    const latest = source(); const review = prepareEducationSwitch(input, "graduate", latest);
    expect(review.discardedGroup).toBe("113-МКо");
    expect(input.draft.studentGroupId).toBe("g2");
    const next = applyEducationSwitch(input, review, latest);
    expect(next.draft).toMatchObject({ studentGroupId: "g1", enrollmentStatus: "graduated" }); expect(next.education.basis).toBe("Мой приказ");
  });
  it("does not treat an unselected destination as a lost transfer choice", () => {
    const input = editor(); input.educationOperation = "transfer"; input.draft = accountDetailsDraftFrom(student);
    expect(prepareEducationSwitch(input, "withdraw", source()).discardedGroup).toBe("");
  });
  it("starts a newly selected transfer without reviving a previously discarded target", () => {
    const input = editor(); const latest = source();
    const next = applyEducationSwitch(input, prepareEducationSwitch(input, "transfer", latest), latest);
    expect(next.draft.studentGroupId).toBe("g1"); expect(next.education).toEqual(input.education);
    expect(getEducationOperationProblem(next.account, next.draft, next.educationOperation, next.education, [], latest.groups, "2026-10-28T10:00:00Z")).toContain("другую учебную группу");
  });
  it("offers an available action after refresh makes the old transfer unavailable", () => {
    const input = editor(); input.account.enrollmentStatus = "graduated"; input.draft.enrollmentStatus = "graduated"; input.educationOperation = "transfer";
    const latest = source(); latest.accounts[0].enrollmentStatus = "graduated";
    const next = applyEducationSwitch(input, prepareEducationSwitch(input, "reinstate", latest), latest);
    expect(next.draft.enrollmentStatus).toBe("studying"); expect(next.education).toEqual(input.education);
  });
  it("retains invalid dates for correction rather than bypassing chronology checks", () => {
    const input = editor(); input.education.effectiveDate = "2026-10-29"; const latest = source();
    const next = applyEducationSwitch(input, prepareEducationSwitch(input, "withdraw", latest), latest);
    expect(next.education.effectiveDate).toBe("2026-10-29");
    expect(getEducationOperationProblem(next.account, next.draft, next.educationOperation, next.education, [], latest.groups, "2026-10-28T10:00:00Z")).toContain("прошедший день");
  });
  it.each(["document", "groups", "actor", "user", "blocked", "target", "source-error"])("rejects stale switching preparation: %s", (reason) => {
    const input = editor(); const latest = source(); const review = prepareEducationSwitch(input, "withdraw", latest);
    if (reason === "document") latest.revision++;
    if (reason === "groups") latest.groupRevision++;
    if (reason === "actor") latest.accounts[1].revision++;
    if (reason === "user") latest.actorId = "other";
    if (reason === "blocked") latest.accounts[1].status = "blocked";
    if (reason === "target") latest.accounts[0].revision++;
    if (reason === "source-error") latest.error = "Ошибка источника";
    expect(() => applyEducationSwitch(input, review, latest)).toThrow(); expect(input.education.basis).toBe("Мой приказ");
  });
  it("rejects a prepared switch if the pending document or previous action changed", () => {
    const input = editor(); const latest = source(); const review = prepareEducationSwitch(input, "withdraw", latest);
    expect(() => applyEducationSwitch({ ...input, education: { ...input.education, basis: "Другой приказ" } }, review, latest)).toThrow("выберите действие заново");
    expect(() => applyEducationSwitch({ ...input, educationOperation: "transfer" }, review, latest)).toThrow("выберите действие заново");
  });
  it("uses existing restrictions for archived groups and unavailable transitions", () => {
    const input = editor(); const latest = source(); input.account.enrollmentStatus = "withdrawn"; latest.accounts[0].enrollmentStatus = "withdrawn"; latest.groups[0].status = "archived";
    expect(() => prepareEducationSwitch(input, "reinstate", latest)).toThrow("Сначала восстановите группу");
    expect(() => prepareEducationSwitch(input, "transfer", latest)).toThrow("текущему состоянию");
  });
});
