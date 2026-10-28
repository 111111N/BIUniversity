import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, readAccountsState } from "../../data/accountStore";
import { refreshAcademicCatalog } from "../../data/academicCatalog";
import { getUsableStudentNumberPreview } from "../../hooks/studentNumberRequestState";
import { refreshAccountCreation, type AccountCreationEditor } from "./accountCreationRefresh";

let values: Map<string, string>;
let writes: number;
const actor = { actorId: "configurator-demo", actorRevision: 1 };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); writes++; } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => undefined); refreshAcademicCatalog();
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const source = () => ({ ...readAccountsState(), actorId: actor.actorId });
const editor = (): AccountCreationEditor => ({ ...actor, revision: 0, baseline: JSON.stringify({ name: "", login: "", role: "student", memberships: [] }), draft: { name: "Мой студент", login: "my.student", email: "student@example.test", role: "student", memberships: [], studentGroupId: "112-mko", studentCampus: 3 } });
const command = (input: AccountCreationEditor, expectedStudentNumber?: string) => ({ actorId: input.actorId, actorRevision: input.actorRevision, expectedRevision: input.revision, draft: input.draft, expectedStudentNumber });

describe("refresh creation with the existing account service", () => {
  it("keeps input when another creation consumes a number, then requires an explicit create using the fresh preview", async () => {
    const input = editor();
    const first = await accountService.previewStudentNumber({ ...actor, campus: 3 }); expect(writes).toBe(0);
    await accountService.create({ ...command(input, first.number), draft: { ...input.draft, name: "Другой студент", login: "other.student" } });
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    await expect(accountService.create(command(input, first.number))).rejects.toThrow("изменились");
    const next = refreshAccountCreation(input, source());
    expect(next.draft).toEqual(input.draft); expect(next.baseline).toBe(input.baseline);
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before); expect(writes).toBe(1);
    const fresh = await accountService.previewStudentNumber({ actorId: next.actorId, actorRevision: next.actorRevision, campus: 3 });
    expect(fresh.number).toBe("202630002"); expect(writes).toBe(1);
    const state = { preview: fresh, loading: false, error: "" };
    expect(getUsableStudentNumberPreview(state, 3, input.revision, new Date().toISOString())).toBeNull();
    expect(getUsableStudentNumberPreview(state, 3, next.revision, new Date().toISOString())).toBe(fresh);
    const created = await accountService.create(command(next, fresh.number));
    expect(created).toMatchObject({ name: input.draft.name, login: input.draft.login, email: input.draft.email, studentGroupId: "112-mko", studentRecord: { number: "202630002" } });
    expect(writes).toBe(2); expect(readAccountsState().accounts).toHaveLength(5);
  });
  it("refreshes changed actor credentials without dropping fields or allocating a number", async () => {
    const input = editor(); const admin = source().accounts.find((entry) => entry.id === actor.actorId)!;
    await accountService.updateDetails({ ...actor, expectedRevision: 0, accountId: admin.id, accountRevision: admin.revision, details: { name: "Актуальное имя администратора", login: admin.login } });
    await expect(accountService.previewStudentNumber({ ...actor, campus: 3 })).rejects.toThrow("изменились");
    const next = refreshAccountCreation(input, source());
    expect(next.actorRevision).toBe(2); expect(next.draft).toEqual(input.draft); expect(writes).toBe(1);
    const number = await accountService.previewStudentNumber({ actorId: next.actorId, actorRevision: next.actorRevision, campus: 3 });
    expect(number.number).toBe("202630001"); expect(writes).toBe(1);
  });
  it("keeps corrupted source bytes and the entered draft on a read failure", () => {
    const input = editor(); const original = structuredClone(input);
    values.set(ACCOUNTS_STORAGE_KEY, "broken accounts");
    expect(() => refreshAccountCreation(input, source())).toThrow();
    expect(input).toEqual(original); expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe("broken accounts"); expect(writes).toBe(0);
  });
  it("refreshes teacher creation without issuing a student number", async () => {
    const input = editor(); input.draft = { name: "Новый преподаватель", login: "new.teacher", email: "teacher@example.test", role: "teacher", memberships: [] };
    await accountService.changeStatus({ ...actor, expectedRevision: 0, accountId: "anna-smirnova", accountRevision: 1, status: "blocked" });
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    const next = refreshAccountCreation(input, source());
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before); expect(writes).toBe(1);
    const created = await accountService.create(command(next));
    expect(created).toMatchObject({ name: input.draft.name, login: input.draft.login, role: "teacher", memberships: [] });
    expect(created.studentRecord).toBeUndefined(); expect(writes).toBe(2);
    expect(JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!).studentNumberCounters).toEqual(JSON.parse(before!).studentNumberCounters);
  });
});
