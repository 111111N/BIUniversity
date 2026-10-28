import { describe, expect, it } from "vitest";
import type { PortalAccount } from "../../domain/accounts";
import type { StudentEducationEvent } from "../../domain/studentEducationEvent";
import { accountDetailsDraftFrom } from "./accountDetailsRefresh";
import { getEducationOperationProblem, prepareEducationOperation, type EducationOperation } from "./educationOperationModel";
import { applyEducationRefresh, isEducationRefreshStale, prepareEducationRefresh, type EducationRefreshEditor, type EducationRefreshSource } from "./educationRefresh";

const now = "2026-10-28T10:00:00Z";
const account: PortalAccount = { id: "student", name: "Студент", login: "student", role: "student", revision: 1, studentGroupId: "g1", memberships: [], status: "blocked" };
const actor: PortalAccount = { id: "admin", name: "Настройщик", login: "admin", role: "configurator", revision: 1, memberships: [] };
const source = (): EducationRefreshSource => ({ revision: 0, actorId: actor.id, accounts: structuredClone([account, actor]), educationEvents: [], groups: [{ id: "g1", name: "101" }, { id: "g2", name: "102" }, { id: "g3", name: "103" }], groupRevision: 0 });
const editor = (operation: EducationOperation = "transfer"): EducationRefreshEditor => {
  const base = accountDetailsDraftFrom(account);
  const draft = prepareEducationOperation(account, base, operation);
  if (operation === "transfer") draft.studentGroupId = "g2";
  return { account: structuredClone(account), draft, baseline: JSON.stringify(base), educationOperation: operation, education: { effectiveDate: "2026-10-25", basis: "Мой приказ", documentNumber: "15-У", documentDate: "2026-10-20" }, educationBaseline: { effectiveDate: "2026-10-28", basis: "" }, revision: 0, actorId: actor.id, actorRevision: 1, educationGroupRevision: 0 };
};
const moved = () => {
  const latest = source(); latest.revision = 1;
  latest.accounts[0] = { ...latest.accounts[0], studentGroupId: "g3", revision: 2, name: "Обновлённое имя" };
  latest.educationEvents = [{ id: "event", accountId: account.id, actorId: actor.id, registeredAt: now, accountRevisionAfter: 2, kind: "transferred", before: { groupId: "g1", groupName: "101", enrollment: "studying" }, after: { groupId: "g3", groupName: "103", enrollment: "studying" }, auditId: "audit", effectiveDate: "2026-10-26", basis: "Другой приказ" } satisfies StudentEducationEvent];
  return latest;
};
describe("refresh of an unfinished education operation", () => {
  it("keeps an unselected destination empty rather than proposing a transfer back to the original group", () => {
    const input = editor(); input.draft.studentGroupId = "g1";
    const latest = moved(); const review = prepareEducationRefresh(input, latest, now);
    expect(review.targetGroup).toBe("Не выбрана");
    const next = applyEducationRefresh(input, review, latest);
    expect(next.draft.studentGroupId).toBe("g3");
    expect(getEducationOperationProblem(next.account, next.draft, next.educationOperation, next.education, latest.educationEvents, latest.groups, now)).toBe("Выберите другую учебную группу для перевода.");
  });
  it("preserves selected group, all document fields and the dirty baseline while loading current personal data", () => {
    const input = editor(); const latest = moved(); const original = structuredClone({ input, latest });
    const review = prepareEducationRefresh(input, latest, now);
    expect(review).toMatchObject({ beforeGroup: "101", currentGroup: "103", targetGroup: "102", lastEventDate: "2026-10-26" });
    expect(review.problem).toContain("раньше последнего события");
    const next = applyEducationRefresh(input, review, latest);
    expect(next.education).toEqual(input.education); expect(next.educationBaseline).toEqual(input.educationBaseline);
    expect(next.draft).toMatchObject({ name: "Обновлённое имя", studentGroupId: "g2" });
    expect(next.account).toMatchObject({ studentGroupId: "g3", status: "blocked" });
    expect(getEducationOperationProblem(next.account, next.draft, next.educationOperation, next.education, latest.educationEvents, latest.groups, now)).toContain("раньше последнего события");
    expect({ input, latest }).toEqual(original);
  });
  it("shows the changed group before continuing graduation against the current state", () => {
    const input = editor("graduate"); const latest = moved();
    const review = prepareEducationRefresh(input, latest, now);
    expect(review.currentGroup).toBe("103"); expect(review.targetGroup).toBe("103");
    expect(input.draft.studentGroupId).toBe("g1");
    const next = applyEducationRefresh(input, review, latest);
    expect(next.draft).toMatchObject({ studentGroupId: "g3", enrollmentStatus: "graduated" });
    expect(next.education.basis).toBe("Мой приказ");
  });
  it("keeps an archived transfer selection for correction and reuses the original operation rules", () => {
    const input = editor(); const latest = source(); latest.groupRevision = 1; latest.groups[1].status = "archived";
    const review = prepareEducationRefresh(input, latest, now);
    expect(review.problem).toContain("действующую учебную группу");
    expect(applyEducationRefresh(input, review, latest).draft.studentGroupId).toBe("g2");
  });
  it("does not silently switch an unavailable operation after another employee graduates the student", () => {
    const input = editor(); const latest = source(); latest.revision = 1; latest.accounts[0] = { ...latest.accounts[0], enrollmentStatus: "graduated", revision: 2 };
    const review = prepareEducationRefresh(input, latest, now);
    expect(review.problem).toContain("Выберите действие");
    const next = applyEducationRefresh(input, review, latest);
    expect(next.educationOperation).toBe("transfer"); expect(next.education).toEqual(input.education);
    expect(getEducationOperationProblem(next.account, next.draft, next.educationOperation, next.education, [], latest.groups, now)).toContain("Выберите действие");
  });
  it.each(["accounts", "groups", "target", "actor", "user", "error"])("rejects a comparison superseded by %s", (reason) => {
    const input = editor(); const latest = source(); const review = prepareEducationRefresh(input, latest, now);
    if (reason === "accounts") latest.revision++;
    if (reason === "groups") latest.groupRevision++;
    if (reason === "target") latest.accounts[0].revision++;
    if (reason === "actor") latest.accounts[1].revision++;
    if (reason === "user") latest.actorId = "someone-else";
    if (reason === "error") latest.groupError = "Ошибка чтения групп";
    expect(isEducationRefreshStale(review, latest)).toBe(true);
    expect(() => applyEducationRefresh(input, review, latest)).toThrow(); expect(input.education.basis).toBe("Мой приказ");
  });
  it.each(["blocked", "missing", "role", "account-error", "group-error"])("preserves input if refresh is unavailable: %s", (reason) => {
    const input = editor(); const latest = source(); const original = structuredClone(input);
    if (reason === "blocked") latest.accounts[1].status = "blocked";
    if (reason === "missing") latest.accounts = [latest.accounts[1]];
    if (reason === "role") latest.accounts[0].role = "teacher";
    if (reason === "account-error") latest.error = "Повреждены учётки";
    if (reason === "group-error") latest.groupError = "Повреждены группы";
    expect(() => prepareEducationRefresh(input, latest, now)).toThrow(); expect(input).toEqual(original);
  });
  it("binds continuation to the operation and baseline used for the comparison", () => {
    const input = editor(); const latest = source(); const review = prepareEducationRefresh(input, latest, now);
    expect(() => applyEducationRefresh({ ...input, educationOperation: "graduate" }, review, latest)).toThrow("Обновите сравнение");
    expect(() => applyEducationRefresh({ ...input, revision: 99 }, review, latest)).toThrow("Обновите сравнение");
  });
});
