import { describe, expect, it } from "vitest";
import type { PortalAccount } from "../../domain/accounts";
import { getAdmissionRestriction } from "../../domain/studentEducation";
import { getEducationDetailsErrors, type StudentEducationEvent } from "../../domain/studentEducationEvent";
import { applyAdmissionRefresh, isAdmissionReviewStale, makeAdmissionEditor, prepareAdmissionRefresh, type AdmissionRefreshSource } from "./admissionRefresh";

const now = "2026-10-28T10:00:00Z";
const student: PortalAccount = { id: "student", name: "Студент", login: "student", revision: 1, role: "student", status: "blocked", memberships: [{ subjectId: "subject", groupIds: ["g1"] }] };
const admin: PortalAccount = { id: "admin", name: "Настройщик", login: "admin", revision: 1, role: "configurator", memberships: [] };
const source = (): AdmissionRefreshSource => ({ accounts: structuredClone([student, admin]), actorId: admin.id, revision: 0, groups: [{ id: "g1", name: "112-МКо" }, { id: "g2", name: "113-МКо" }], groupRevision: 0, educationEvents: [] });
const editor = () => ({ ...makeAdmissionEditor(student.id, { effectiveDate: "2026-10-28", basis: "" }, source()), education: { effectiveDate: "2026-09-01", basis: "Приказ о зачислении", documentNumber: "15-У", documentDate: "2026-08-30" } });
const event: StudentEducationEvent = { id: "first", accountId: student.id, actorId: admin.id, registeredAt: now, effectiveDate: "2026-10-27", basis: "Другой документ", kind: "admitted", after: { groupId: "g1", groupName: "112-МКо", enrollment: "studying" }, accountRevisionAfter: 2, auditId: "audit" };

describe("admission refresh without discarding the document", () => {
  it("shows old and current groups, preserves the complete input and baseline, and detaches snapshots", () => {
    const input = editor(); const latest = source(); latest.revision++; latest.groupRevision++; latest.accounts[0] = { ...latest.accounts[0], name: "Новое имя", studentGroupId: "g2", revision: 2 }; latest.accounts[1].revision++;
    const original = structuredClone({ input, latest }); const review = prepareAdmissionRefresh(input, latest, now);
    expect(review).toMatchObject({ currentGroup: "113-МКо", restriction: "", firstEvent: null, fieldProblem: "" });
    expect(input.groupName).toBe("112-МКо");
    const next = applyAdmissionRefresh(input, review, latest);
    expect(next.education).toEqual(input.education); expect(next.baseline).toEqual(input.baseline);
    expect(next).toMatchObject({ groupName: "113-МКо", actorRevision: 2, revision: 1, groupRevision: 1, account: { name: "Новое имя", status: "blocked", revision: 2 } });
    expect({ input, latest }).toEqual(original);
    next.account.memberships[0].groupIds.push("other"); expect(latest.accounts[0].memberships[0].groupIds).toEqual(["g1"]);
  });
  it("shows the first event and refuses a second admission without losing entered details", () => {
    const input = editor(); const latest = source(); latest.educationEvents.push(event); latest.revision++; latest.accounts[0].revision++;
    const review = prepareAdmissionRefresh(input, latest, now);
    expect(review.firstEvent).toEqual({ kind: "admitted", effectiveDate: "2026-10-27" });
    expect(review.restriction).toContain("История обучения уже начата");
    expect(() => applyAdmissionRefresh(input, review, latest)).toThrow(review.restriction); expect(input.education.documentNumber).toBe("15-У");
  });
  it.each(["withdrawn", "archived", "missing-group", "role", "missing-account"])("retains the document while reporting an unavailable admission: %s", (reason) => {
    const input = editor(); const latest = source(); latest.revision++;
    if (reason === "withdrawn") latest.accounts[0].enrollmentStatus = "withdrawn";
    if (reason === "archived") latest.groups[0].status = "archived";
    if (reason === "missing-group") latest.groups = [];
    if (reason === "role") latest.accounts[0].role = "teacher";
    if (reason === "missing-account") latest.accounts.shift();
    const review = prepareAdmissionRefresh(input, latest, now);
    expect(review.restriction).not.toBe(""); expect(() => applyAdmissionRefresh(input, review, latest)).toThrow();
    expect(input.education.basis).toBe("Приказ о зачислении"); expect(input.baseline.basis).toBe("");
    if (reason !== "missing-account") expect(review.restriction).toBe(getAdmissionRestriction(latest.accounts[0], latest.educationEvents, latest.groups));
  });
  it("lets an invalid date return to the form for correction without treating refresh as validation success", () => {
    const input = editor(); input.education.effectiveDate = "2026-10-29"; const latest = source();
    const review = prepareAdmissionRefresh(input, latest, now);
    expect(review.restriction).toBe(""); expect(review.fieldProblem).toContain("прошедший день");
    const next = applyAdmissionRefresh(input, review, latest);
    expect(next.education.effectiveDate).toBe("2026-10-29"); expect(getEducationDetailsErrors(next.education, now)[0].field).toBe("effectiveDate");
  });
  it.each(["document", "groups", "actor-revision", "user", "blocked", "role", "target", "error", "group-error"])("rejects a comparison that became stale: %s", (reason) => {
    const input = editor(); const latest = source(); const review = prepareAdmissionRefresh(input, latest, now);
    if (reason === "document") latest.revision++;
    if (reason === "groups") latest.groupRevision++;
    if (reason === "actor-revision") latest.accounts[1].revision++;
    if (reason === "user") latest.actorId = "other";
    if (reason === "blocked") latest.accounts[1].status = "blocked";
    if (reason === "role") latest.accounts[1].role = "teacher";
    if (reason === "target") latest.accounts[0].revision++;
    if (reason === "error") latest.error = "Ошибка учёток";
    if (reason === "group-error") latest.groupError = "Ошибка групп";
    expect(isAdmissionReviewStale(review, latest)).toBe(true);
    expect(() => applyAdmissionRefresh(input, review, latest)).toThrow(); expect(input.education.documentNumber).toBe("15-У");
  });
  it("binds the comparison to the exact entered document and original account", () => {
    const input = editor(); const latest = source(); const review = prepareAdmissionRefresh(input, latest, now);
    expect(() => applyAdmissionRefresh({ ...input, education: { ...input.education, basis: "Другой документ" } }, review, latest)).toThrow("Обновите сравнение");
    expect(() => applyAdmissionRefresh({ ...input, baseline: { ...input.baseline, basis: "Другая база" } }, review, latest)).toThrow();
    expect(() => applyAdmissionRefresh({ ...input, account: { ...input.account, id: "other" } }, review, latest)).toThrow();
  });
  it("does not adopt another user when refreshing and refuses unavailable initial admissions", () => {
    const input = editor(); const latest = source(); latest.actorId = "other"; latest.accounts.push({ ...admin, id: "other" });
    expect(() => prepareAdmissionRefresh(input, latest, now)).toThrow("Пользователь или права");
    latest.actorId = admin.id; latest.educationEvents.push(event);
    expect(() => makeAdmissionEditor(student.id, input.education, latest)).toThrow("История обучения уже начата");
  });
});
