import { describe, expect, it } from "vitest";
import { createInitialAccountsDocument } from "../data/accountStore";
import { decodeAccountsDocument, updateAccountDetails, type AccountsDocument, type UpdateAccountDetailsCommand } from "./accounts";
import { appendEducationChange, confirmStudentAdmission, educationStateFor } from "./studentEducation";
import { getEducationPeriods, getEducationStateAt, getMoscowDateKey, normalizeEducationDetails, type EducationEventDetails } from "./studentEducationEvent";
import { applyStudentBulk, previewStudentBulk, studentBulkSourceKey, type StudentBulkRequest } from "./studentBulk";

const groups = [{ id: "112-mko", name: "112-МКо" }, { id: "new-group", name: "101-ИВТ" }, { id: "archive", name: "Архив", status: "archived" as const }];
const registered = "2026-10-26T10:00:00Z";
const details: EducationEventDetails = { effectiveDate: "2026-09-01", basis: "Зачисление по заявлению", documentNumber: "100", documentDate: "2026-08-25" };
const context = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0, accountId: "anna-smirnova", accountRevision: 1, expectedGroupRevision: 0, education: details };
const admission = () => confirmStudentAdmission(createInitialAccountsDocument(), context, groups, 0, "admission", registered);
const operation = (state: AccountsDocument, effectiveDate = "2026-10-01", action: StudentBulkRequest["action"] = { kind: "transfer", groupId: "new-group" }) => {
  const request = { targets: [{ accountId: context.accountId, revision: state.accounts[1].revision }], action, education: { effectiveDate, basis: "Приказ о переводе" } };
  return applyStudentBulk(state, { ...context, expectedRevision: state.revision, request, fingerprint: "a".repeat(64), batchId: `batch-${state.revision}` }, groups, 0, registered, [`audit-${state.revision}`]);
};

describe("dated education history", () => {
  it("uses Moscow calendar day at midnight, independently of browser timezone", () => {
    expect(getMoscowDateKey("2026-10-25T21:05:00Z")).toBe("2026-10-26");
    expect(getMoscowDateKey("2026-10-25T20:59:00Z")).toBe("2026-10-25");
    expect(normalizeEducationDetails({ ...details, effectiveDate: "2026-10-26", basis: "  Приказ  " }, "2026-10-25T21:05:00Z").basis).toBe("Приказ");
  });
  it.each(["2026-10-27", "2026-02-30", "bad", "2026-13-01"])("rejects future or invalid effective date %s", (effectiveDate) => {
    expect(() => normalizeEducationDetails({ ...details, effectiveDate }, registered)).toThrow("Дата действия");
  });
  it("requires a basis and validates optional document fields", () => {
    expect(() => normalizeEducationDetails({ ...details, basis: "  " }, registered)).toThrow("основание");
    expect(() => normalizeEducationDetails({ ...details, documentDate: "2026-10-27" }, registered)).toThrow("дату документа");
    expect(() => normalizeEducationDetails({ ...details, documentNumber: "x".repeat(81) }, registered)).toThrow("80");
  });
  it("does not invent dates for legacy accounts and explicitly confirms admission without changing their number, group or access", () => {
    const initial = createInitialAccountsDocument(); const student = initial.accounts[1];
    student.status = "blocked"; student.studentRecord = { number: "202630001", year: 2026, campus: 3, sequence: 1, issuedAt: registered };
    expect(getEducationStateAt(initial.educationEvents ?? [], "2026-09-01")).toBeUndefined();
    const state = confirmStudentAdmission(initial, context, groups, 0, "admission", registered);
    expect(state.accounts[1]).toEqual({ ...student, revision: 2, updatedAt: registered });
    expect(state.educationEvents?.[0]).toMatchObject({ kind: "admitted", effectiveDate: "2026-09-01", registeredAt: registered, auditId: "admission" });
    expect(decodeAccountsDocument(JSON.stringify(state))).toEqual(state);
  });
  it("rejects duplicate admission, stale revisions, forbidden actor and archived group", () => {
    const state = admission();
    expect(() => confirmStudentAdmission(state, { ...context, expectedRevision: 1, accountRevision: 2 }, groups, 0, "new", registered)).toThrow("История");
    expect(() => confirmStudentAdmission(state, context, groups, 0, "new", registered)).toThrow("изменились");
    expect(() => confirmStudentAdmission(createInitialAccountsDocument(), { ...context, actorId: context.accountId }, groups, 0, "new", registered)).toThrow("настройщику");
    expect(() => confirmStudentAdmission(createInitialAccountsDocument(), context, [{ ...groups[0], status: "archived" }], 0, "new", registered)).toThrow("архиве");
    expect(() => confirmStudentAdmission(createInitialAccountsDocument(), context, groups, 1, "new", registered)).toThrow("Справочник");
  });
  it("appends dated transfers and graduation, keeping half-open periods and unknown earlier dates", () => {
    const transferred = operation(admission()); const graduated = operation(transferred.state, "2026-10-20", { kind: "graduated" });
    const events = graduated.state.educationEvents!;
    expect(events.map((event) => event.kind)).toEqual(["admitted", "transferred", "graduated"]);
    expect(getEducationPeriods(events).map((period) => [period.from, period.until])).toEqual([["2026-09-01", "2026-10-01"], ["2026-10-01", "2026-10-20"], ["2026-10-20", null]]);
    expect(getEducationStateAt(events, "2026-08-31")).toBeUndefined();
    expect(getEducationStateAt(events, "2026-10-01")).toMatchObject({ groupId: "new-group", enrollment: "studying" });
    expect(getEducationStateAt(events, "2026-10-20")?.enrollment).toBe("graduated");
    expect(decodeAccountsDocument(JSON.stringify(graduated.state))).toEqual(graduated.state);
    expect(graduated.receipt.education?.effectiveDate).toBe("2026-10-20");
  });
  it("keeps order for same-day events, omitting empty periods", () => {
    const transferred = operation(admission(), "2026-09-01"); const graduated = operation(transferred.state, "2026-09-01", { kind: "graduated" });
    expect(getEducationPeriods(graduated.state.educationEvents!)).toHaveLength(1);
    expect(getEducationStateAt(graduated.state.educationEvents!, "2026-09-01")?.enrollment).toBe("graduated");
  });
  it("does not backdate before the last event and does not mutate rejected input", () => {
    const state = admission(); const bytes = JSON.stringify(state);
    expect(() => operation(state, "2026-08-31")).toThrow("ошибки");
    expect(JSON.stringify(state)).toBe(bytes);
    expect(() => operation(state, "2026-10-27")).toThrow("Дата действия");
  });
  it("requires dated changes once history starts, while allowing contact edits", () => {
    const state = admission();
    const command: UpdateAccountDetailsCommand = { ...context, expectedRevision: 1, accountRevision: 2, education: undefined, details: { name: "Анна Новая", login: "anna.smirnova" } };
    expect(updateAccountDetails(state, command, "contact", registered).educationEvents).toEqual(state.educationEvents);
    expect(() => updateAccountDetails(state, { ...command, details: { ...command.details, studentGroupId: "new-group", memberships: [] } }, "contact", registered)).toThrow("дату действия");
    expect(previewStudentBulk(state, groups, { targets: [{ accountId: context.accountId, revision: 2 }], action: { kind: "graduated" } }).errors).toBe(1);
  });
  it("records individual reinstatement and rejects simultaneous state and group changes", () => {
    const state = operation(admission(), "2026-10-01", { kind: "withdrawn" }).state; const before = educationStateFor(state.accounts[1], groups);
    const updated = updateAccountDetails(state, { ...context, expectedRevision: 2, accountRevision: 3, education: { ...details, effectiveDate: "2026-10-10" }, details: { name: state.accounts[1].name, login: state.accounts[1].login, enrollmentStatus: "studying" } }, "reinstate", registered);
    const next = appendEducationChange(updated, context.accountId, before, educationStateFor(updated.accounts[1], groups), { ...details, effectiveDate: "2026-10-10" }, "reinstate", registered);
    expect(next.educationEvents?.at(-1)?.kind).toBe("reinstated");
    expect(decodeAccountsDocument(JSON.stringify(next))).toEqual(next);
    expect(() => appendEducationChange(updated, context.accountId, before, { ...before, groupId: "new-group", enrollment: "studying" }, details, "reinstate", registered)).toThrow();
  });
  it("binds metadata to fingerprint and rejects broken audit/receipt/history links", () => {
    const state = operation(admission()).state;
    const request: StudentBulkRequest = { targets: [{ accountId: context.accountId, revision: 1 }], action: { kind: "graduated" }, education: details };
    expect(studentBulkSourceKey(request)).not.toBe(studentBulkSourceKey({ ...request, education: { ...details, basis: "Другое основание" } }));
    for (const corrupt of [(copy: AccountsDocument) => { copy.educationEvents = []; for (const audit of copy.history) delete audit.educationEventId; }, (copy: AccountsDocument) => { copy.history[0].educationEventId = "missing"; }, (copy: AccountsDocument) => { copy.educationEvents![1].effectiveDate = "2026-08-01"; }, (copy: AccountsDocument) => { copy.studentOperations![0].education!.basis = "Подменённое основание"; }, (copy: AccountsDocument) => { copy.educationEvents![0].accountRevisionAfter = 500; }]) {
      const copy = structuredClone(state); corrupt(copy); expect(() => decodeAccountsDocument(JSON.stringify(copy))).toThrow();
    }
  });
});
