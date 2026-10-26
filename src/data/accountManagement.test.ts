import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, readAccountsState, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument } from "./accountStore";
import { changeAccountRole, decodeAccountsDocument, updateAccountDetails } from "../domain/accounts";

let values: Map<string, string>;
const context = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0 };
const draft = { name: "Новый Студент", login: "new.student", role: "student" as const, studentCampus: 3, memberships: [{ subjectId: "data-analysis", groupIds: ["112-mko"] }] };
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("account lifecycle and student records", () => {
  it("issues only one of two concurrent identical previews and requires a new preview for the second creation", async () => {
    const preview = await accountService.previewStudentNumber({ ...context, campus: 3 });
    expect(values.size).toBe(0);
    const results = await Promise.allSettled([accountService.create({ ...context, draft, expectedStudentNumber: preview.number }), accountService.create({ ...context, draft: { ...draft, login: "second.student" }, expectedStudentNumber: preview.number })]);
    expect(results.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(readAccountsState().accounts.at(-1)?.studentRecord?.number).toBe("202630001");
    const next = await accountService.previewStudentNumber({ ...context, campus: 3 });
    expect(next.number).toBe("202630002");
    await accountService.create({ ...context, expectedRevision: next.revision, draft: { ...draft, login: "second.student" }, expectedStudentNumber: next.number });
    expect(readAccountsState().accounts.at(-1)?.studentRecord?.number).toBe("202630002");
  });
  it("preserves the number through profile, group and type changes and never allows overwriting it", async () => {
    const created = await accountService.create({ ...context, draft, expectedStudentNumber: "202630001" });
    const changed = await accountService.updateDetails({ ...context, expectedRevision: 1, accountId: created.id, accountRevision: 1, details: { name: "Другое Имя", login: "other.student", email: "student@example.test", memberships: [{ subjectId: "data-analysis", groupIds: ["411-bi"] }] } });
    expect(changed).toMatchObject({ id: created.id, studentRecord: created.studentRecord, email: "student@example.test", name: "Другое Имя" });
    const teacher = await accountService.changeRole({ ...context, expectedRevision: 2, accountId: created.id, accountRevision: 2, role: "teacher", memberships: [] });
    const student = await accountService.changeRole({ ...context, expectedRevision: 3, accountId: created.id, accountRevision: 3, role: "student", memberships: draft.memberships });
    expect(teacher.studentRecord).toEqual(created.studentRecord); expect(student.studentRecord).toEqual(created.studentRecord);
    await expect(accountService.issueStudentRecord({ ...context, expectedRevision: 4, accountId: student.id, accountRevision: 4, campus: 9, expectedStudentNumber: "202690001" })).rejects.toThrow("уже выдан");
    expect(readAccountsState().history.map((entry) => entry.action)).toEqual(["created", "details-changed", "role-changed", "role-changed"]);
  });
  it("loads legacy accounts unchanged and can issue a number explicitly without destroying journal identity", async () => {
    expect(readAccountsState().accounts.find((entry) => entry.id === "anna-smirnova")?.studentRecord).toBeUndefined();
    const issued = await accountService.issueStudentRecord({ ...context, accountId: "anna-smirnova", accountRevision: 1, campus: 9, expectedStudentNumber: "202690001" });
    expect(issued).toMatchObject({ id: "anna-smirnova", studentRecord: { number: "202690001" } });
    const saved = values.get(ACCOUNTS_STORAGE_KEY)!;
    expect(decodeAccountsDocument(saved).accounts.find((entry) => entry.id === issued.id)?.studentRecord).toEqual(issued.studentRecord);
    const duplicate = JSON.parse(saved); duplicate.accounts[0].studentRecord = issued.studentRecord;
    expect(() => decodeAccountsDocument(JSON.stringify(duplicate))).toThrow("Повторяется номер");
  });
  it("blocks and restores access without deleting identity, and rejects all commands from a blocked configurator", async () => {
    const blocked = await accountService.changeStatus({ ...context, accountId: "anna-smirnova", accountRevision: 1, status: "blocked" });
    expect(blocked).toMatchObject({ id: "anna-smirnova", status: "blocked" });
    const active = await accountService.changeStatus({ ...context, expectedRevision: 1, accountId: blocked.id, accountRevision: 2, status: "active" });
    expect(active.memberships).toEqual(blocked.memberships);
    await expect(accountService.changeStatus({ ...context, expectedRevision: 2, accountId: context.actorId, accountRevision: 1, status: "blocked" })).rejects.toThrow("свою");
    const state = createInitialAccountsDocument(); state.accounts[2].status = "blocked"; state.accounts.push({ ...state.accounts[2], id: "other-admin", login: "other.admin", status: "active" }); values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    await expect(accountService.previewStudentNumber({ ...context, campus: 1 })).rejects.toThrow("активному");
    await expect(accountService.create({ ...context, draft, expectedStudentNumber: "202630001" })).rejects.toThrow("активному");
    await expect(accountService.changeStatus({ ...context, accountId: "anna-smirnova", accountRevision: 1, status: "blocked" })).rejects.toThrow("активному");
  });
  it("ignores forged profile fields and protects the last active configurator even if another is blocked", () => {
    const state = createInitialAccountsDocument(); state.accounts.push({ ...state.accounts[2], id: "blocked-admin", login: "blocked.admin", status: "blocked" });
    expect(() => changeAccountRole(state, { ...context, accountId: context.actorId, accountRevision: 1, role: "teacher", memberships: [] }, "change", new Date().toISOString())).toThrow("последнего");
    const details = { name: "Новое Имя", login: "configurator", role: "student", status: "blocked", studentRecord: { number: "fake" } };
    const changed = updateAccountDetails(state, { ...context, accountId: context.actorId, accountRevision: 1, details }, "change", new Date().toISOString());
    expect(changed.accounts[2]).toMatchObject({ role: "configurator", name: "Новое Имя" }); expect(changed.accounts[2].studentRecord).toBeUndefined(); expect(changed.accounts[2].status).toBeUndefined();
  });
});
