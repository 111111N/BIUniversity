import { describe, expect, it } from "vitest";
import { queryGroupComposition, type GroupCompositionQuery } from "./groupComposition";
import type { PortalAccount } from "./accounts";
import type { EducationState, StudentEducationEvent } from "./studentEducationEvent";

const today = "2026-10-26T12:00:00Z";
const groups = [{ id: "a", name: "101-ИВТ", status: "archived" as const }, { id: "b", name: "102-ИВТ" }];
const student = (id: string, group = "a", patch: Partial<PortalAccount> = {}): PortalAccount => ({ id, name: `Студент ${id}`, login: `student.${id}`, role: "student", revision: 1, memberships: [], studentGroupId: group, ...patch });
const snapshot = (groupId: string, enrollment: EducationState["enrollment"] = "studying"): EducationState => ({ groupId, groupName: groupId === "a" ? "101-ИВТ" : "102-ИВТ", enrollment });
const event = (id: string, accountId: string, effectiveDate: string, after: EducationState, before?: EducationState): StudentEducationEvent => ({ id, accountId, actorId: "admin", auditId: id, accountRevisionAfter: 2, effectiveDate, registeredAt: today, basis: "Основание события", kind: before ? before.groupId !== after.groupId ? "transferred" : after.enrollment === "studying" ? "reinstated" : after.enrollment : "admitted", before, after });
const query = (patch: Partial<GroupCompositionQuery> = {}): GroupCompositionQuery => ({ groupId: "a", date: "2026-09-15", view: "studying", q: "", page: 1, ...patch });

describe("dated group composition", () => {
  it("keeps a transferred student in the old group until the effective transfer date", () => {
    const accounts = [student("one", "b")]; const events = [event("admit", "one", "2026-09-01", snapshot("a")), event("transfer", "one", "2026-10-01", snapshot("b"), snapshot("a"))];
    expect(queryGroupComposition(accounts, events, groups, query(), today).rows[0]).toMatchObject({ accountId: "one", knowledge: "confirmed", source: { id: "admit" } });
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-01" }), today).counts.studying).toBe(0);
    expect(queryGroupComposition(accounts, events, groups, query({ groupId: "b", date: "2026-10-01" }), today).counts.studying).toBe(1);
  });
  it.each(["graduated", "withdrawn"] as const)("separates %s from studying on the effective day", (enrollment) => {
    const accounts = [student("one", "a", { enrollmentStatus: enrollment })]; const events = [event("admit", "one", "2026-09-01", snapshot("a")), event("finish", "one", "2026-10-20", snapshot("a", enrollment), snapshot("a"))];
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-19" }), today).counts).toEqual({ studying: 1, completed: 0, unknown: 0 });
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-20", view: "completed" }), today).rows[0].enrollment).toBe(enrollment);
  });
  it("uses the last same-day event and recognizes subsequent reinstatement", () => {
    const accounts = [student("one")];
    const events = [event("admit", "one", "2026-09-01", snapshot("a")), event("to-b", "one", "2026-10-01", snapshot("b"), snapshot("a")), event("to-a", "one", "2026-10-01", snapshot("a"), snapshot("b")), event("out", "one", "2026-10-10", snapshot("a", "withdrawn"), snapshot("a")), event("back", "one", "2026-10-15", snapshot("a"), snapshot("a", "withdrawn"))];
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-01" }), today).rows[0].source?.id).toBe("to-a");
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-10", view: "completed" }), today).total).toBe(1);
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-15" }), today).rows[0].source?.id).toBe("back");
  });
  it("does not invent admission dates from account creation, access, student number or terminal state", () => {
    const accounts = [student("old", "a", { createdAt: "2026-01-01T10:00:00Z", enrollmentStatus: "graduated", status: "blocked", studentRecord: { number: "202610001", year: 2026, campus: 1, sequence: 1, issuedAt: today } }), student("other", "b")];
    const result = queryGroupComposition(accounts, [], groups, query({ view: "unknown" }), today);
    expect(result.counts).toEqual({ studying: 0, completed: 0, unknown: 1 });
    expect(result.rows[0]).toMatchObject({ accountId: "old", unknownReason: "no-history" });
  });
  it("does not use the before-snapshot of the first transfer to infer earlier membership", () => {
    const accounts = [student("moved", "b")]; const events = [event("first", "moved", "2026-10-01", snapshot("b"), snapshot("a"))];
    const result = queryGroupComposition(accounts, events, groups, query({ view: "unknown" }), today);
    expect(result.rows[0]).toMatchObject({ unknownReason: "before-history", firstEventDate: "2026-10-01" });
    expect(result.counts.studying).toBe(0);
    expect(queryGroupComposition(accounts, events, groups, query({ date: "2026-10-01", view: "unknown" }), today).total).toBe(0);
  });
  it("excludes a confirmed other-group state even if the student belongs here now", () => {
    const accounts = [student("later")]; const events = [event("admit", "later", "2026-09-01", snapshot("b")), event("move", "later", "2026-10-01", snapshot("a"), snapshot("b"))];
    expect(queryGroupComposition(accounts, events, groups, query({ view: "unknown" }), today).counts).toEqual({ studying: 0, completed: 0, unknown: 0 });
  });
  it("retains historical membership for changed account types and blocked accounts in archived groups", () => {
    const accounts = [student("teacher", "b", { role: "teacher", studentGroupId: undefined }), student("blocked", "a", { status: "blocked" })];
    const events = accounts.map((account) => event(account.id, account.id, "2026-09-01", snapshot("a")));
    expect(queryGroupComposition(accounts, events, groups, query(), today).rows.map((row) => row.accountId).sort()).toEqual(["blocked", "teacher"]);
  });
  it("searches current identity and number, sorts deterministically, paginates and keeps category totals independent of search", () => {
    const accounts = Array.from({ length: 45 }, (_, index) => student(String(index), "a", { name: `Студент ${index}`, email: `mail.${index}@example.test` }));
    const events = accounts.map((account) => event(account.id, account.id, "2026-09-01", snapshot("a")));
    const before = JSON.stringify({ accounts, events });
    const second = queryGroupComposition(accounts, events, groups, query({ page: 2 }), today);
    expect(second).toMatchObject({ total: 45, page: 2, pages: 3 }); expect(second.rows[0].name).toBe("Студент 20"); expect(second.rows).toHaveLength(20);
    const search = queryGroupComposition(accounts, events, groups, query({ q: "MAIL.42@EXAMPLE.TEST", page: 999 }), today);
    expect(search).toMatchObject({ total: 1, page: 1, counts: { studying: 45 } }); expect(search.rows[0].accountId).toBe("42");
    expect(queryGroupComposition(accounts, events, groups, query({ page: -1 }), today).page).toBe(1);
    expect(JSON.stringify({ accounts, events })).toBe(before);
  });
  it("handles 100 groups and 10,000 students without returning the full roster", () => {
    const manyGroups = Array.from({ length: 100 }, (_, index) => ({ id: `group-${index}`, name: `Группа ${index}` }));
    const accounts = Array.from({ length: 10000 }, (_, index) => student(String(index), `group-${index % 100}`, { enrollmentStatus: index >= 5000 ? "graduated" : "studying" }));
    const events = accounts.flatMap((account, index) => [event(`admit-${index}`, account.id, "2026-09-01", snapshot(account.studentGroupId!)), ...(index >= 5000 ? [event(`end-${index}`, account.id, "2026-10-01", snapshot(account.studentGroupId!, "graduated"), snapshot(account.studentGroupId!))] : [])]);
    const result = queryGroupComposition(accounts, events, manyGroups, query({ groupId: "group-42", date: "2026-10-26" }), today);
    expect(result.counts).toEqual({ studying: 50, completed: 50, unknown: 0 }); expect(result.total).toBe(50); expect(result.rows).toHaveLength(20);
  });
  it.each(["2026-10-27", "2026-02-30", "invalid", ""])("rejects future and invalid query date %s", (date) => {
    expect(() => queryGroupComposition([], [], groups, query({ date }), today)).toThrow("дату");
  });
  it("uses the Moscow day and rejects an unavailable group or invalid view", () => {
    expect(queryGroupComposition([], [], groups, query({ date: "2026-10-26" }), "2026-10-25T21:01:00Z").total).toBe(0);
    expect(() => queryGroupComposition([], [], groups, query({ groupId: "missing" }), today)).toThrow("Группа");
    expect(() => queryGroupComposition([], [], groups, query({ view: "bad" as GroupCompositionQuery["view"] }), today)).toThrow("список");
  });
});
