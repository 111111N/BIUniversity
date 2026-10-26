import { describe, expect, it } from "vitest";
import { changeAccountRole, createAccount, decodeAccountsDocument, normalizeAccountLogin, replaceSubjectTeachingGroups, updateTeacherAssignments, type AccountDraft } from "./accounts";
import { createInitialAccountsDocument } from "../data/accountStore";

const context = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0, studentCampus: 1, expectedStudentNumber: "202610001" };
const draft: AccountDraft = { name: "  Новый   студент  ", login: " New.Student ", role: "student", studentCampus: 1, memberships: [{ subjectId: "data-analysis", groupIds: ["112-mko"] }] };
const date = "2026-10-23T10:00:00.000Z";
describe("account commands", () => {
  it("normalizes logins and rejects duplicates regardless of case and compatibility characters", () => {
    expect(normalizeAccountLogin(" Ａnna.Smirnova ")).toBe("anna.smirnova");
    const state = createInitialAccountsDocument();
    expect(() => createAccount(state, { ...context, draft: { ...draft, login: "ANNA.SMIRNOVA" } }, "new", "audit", date)).toThrow("занят");
    const next = createAccount(state, { ...context, draft }, "new", "audit", date);
    expect(next.accounts.at(-1)).toMatchObject({ id: "new", login: "new.student", name: "Новый студент", revision: 1 });
    expect(state.accounts).toHaveLength(3);
    expect(next.history.at(-1)).toMatchObject({ accountId: "new", actorId: "configurator-demo", action: "created" });
  });
  it("reauthorizes the current author and rejects stale revisions", () => {
    const state = createInitialAccountsDocument();
    expect(() => createAccount(state, { ...context, actorId: "anna-smirnova", draft }, "new", "audit", date)).toThrow("настройщику");
    expect(() => createAccount(state, { ...context, actorRevision: 2, draft }, "new", "audit", date)).toThrow("изменились");
    expect(() => createAccount(state, { ...context, expectedRevision: 2, draft }, "new", "audit", date)).toThrow("изменились");
  });
  it("preserves identity and audit while changing type, and protects the last configurator", () => {
    const state = createInitialAccountsDocument();
    const next = changeAccountRole(state, { ...context, accountId: "anna-smirnova", accountRevision: 1, role: "configurator", memberships: [] }, "audit", date);
    expect(next.accounts.find((account) => account.id === "anna-smirnova")).toMatchObject({ id: "anna-smirnova", login: "anna.smirnova", role: "configurator", revision: 2 });
    expect(next.history[0]).toMatchObject({ previousRole: "student", nextRole: "configurator", accountId: "anna-smirnova" });
    expect(() => changeAccountRole(state, { ...context, accountId: "configurator-demo", accountRevision: 1, role: "student", memberships: draft.memberships }, "audit", date)).toThrow("последнего");
    const changed = changeAccountRole(next, { ...context, expectedRevision: 1, accountId: "configurator-demo", accountRevision: 1, role: "student", memberships: draft.memberships }, "audit2", date);
    expect(changed.accounts.find((account) => account.id === "configurator-demo")?.role).toBe("student");
    expect(changed.history).toHaveLength(2);
  });
  it("requires one student group and allows creating a teacher before discipline assignment", () => {
    const state = createInitialAccountsDocument();
    expect(() => createAccount(state, { ...context, draft: { ...draft, memberships: [] } }, "new", "audit", date)).toThrow("группу");
    expect(() => createAccount(state, { ...context, draft: { ...draft, memberships: [{ subjectId: "data-analysis", groupIds: ["112-mko", "411-bi"] }] } }, "new", "audit", date)).toThrow("одной");
    expect(createAccount(state, { ...context, draft: { ...draft, role: "teacher", memberships: [] } }, "new", "audit", date).accounts.at(-1)).toMatchObject({ role: "teacher", memberships: [] });
  });
  it("updates discipline groups without altering identity, role, other disciplines or prior history", () => {
    const state = createInitialAccountsDocument();
    const teacher = state.accounts[0];
    const memberships = replaceSubjectTeachingGroups(teacher.memberships, "data-analysis", ["411-bi"]);
    const next = updateTeacherAssignments(state, { ...context, accountId: teacher.id, accountRevision: 1, memberships }, "assignment-audit", date);
    expect(next.accounts[0]).toEqual({ ...teacher, memberships, revision: 2 });
    expect(next.accounts[0].memberships.filter((entry) => entry.subjectId !== "data-analysis")).toEqual(teacher.memberships.filter((entry) => entry.subjectId !== "data-analysis"));
    expect(next.history[0]).toMatchObject({ action: "assignments-changed", previousMemberships: teacher.memberships, nextMemberships: memberships, previousRole: "teacher", nextRole: "teacher" });
    expect(decodeAccountsDocument(JSON.stringify(next))).toEqual(next);
    expect(state.accounts[0]).toEqual(teacher);
    const empty = updateTeacherAssignments(next, { ...context, expectedRevision: 1, accountId: teacher.id, accountRevision: 2, memberships: [] }, "clear", date);
    expect(empty.accounts[0].memberships).toEqual([]);
    expect(empty.history).toHaveLength(2);
  });
  it("rejects student assignments, stale account revisions, duplicate and unchanged assignments", () => {
    const state = createInitialAccountsDocument();
    const command = { ...context, accountId: state.accounts[0].id, accountRevision: 1, memberships: state.accounts[0].memberships };
    expect(() => updateTeacherAssignments(state, command, "audit", date)).toThrow("не изменились");
    expect(() => updateTeacherAssignments(state, { ...command, accountRevision: 2 }, "audit", date)).toThrow("изменилась");
    expect(() => updateTeacherAssignments(state, { ...command, accountId: "anna-smirnova" }, "audit", date)).toThrow("преподавателю");
    expect(() => updateTeacherAssignments(state, { ...command, memberships: [...command.memberships, command.memberships[0]] }, "audit", date)).toThrow("повторяться");
    expect(replaceSubjectTeachingGroups(command.memberships, "data-analysis", []).some((entry) => entry.subjectId === "data-analysis")).toBe(false);
  });
  it("rejects damaged account and audit documents rather than silently dropping records", () => {
    const state = createInitialAccountsDocument();
    expect(decodeAccountsDocument(JSON.stringify(state))).toEqual(state);
    expect(() => decodeAccountsDocument("broken")).toThrow();
    expect(() => decodeAccountsDocument(JSON.stringify({ ...state, accounts: [...state.accounts, state.accounts[0]] }))).toThrow();
    expect(() => decodeAccountsDocument(JSON.stringify({ ...state, history: [{ bad: true }] }))).toThrow();
    expect(() => decodeAccountsDocument(JSON.stringify({ ...state, accounts: state.accounts.filter((account) => account.role !== "configurator") }))).toThrow();
  });
});
