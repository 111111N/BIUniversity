import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNTS_STORAGE_KEY, accountService, createInitialAccountsDocument, readAccountsState, registerAccountRoleChangeGuard, registerTeachingAssignmentGuard } from "./accountStore";

const context = { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0 };
const draft = { name: "Новый студент", login: "new.student", role: "student" as const, memberships: [{ subjectId: "data-analysis", groupIds: ["112-mko"] }] };
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("local account service", () => {
  it("keeps legacy IDs, seeds only absent storage and preserves damaged bytes", async () => {
    expect(readAccountsState().accounts.map((account) => account.id)).toEqual(["teacher-elena-volkova", "anna-smirnova", "configurator-demo"]);
    expect(values.size).toBe(0);
    values.set(ACCOUNTS_STORAGE_KEY, "damaged raw bytes");
    expect(readAccountsState()).toMatchObject({ accounts: [], error: expect.stringContaining("не изменены") });
    await expect(accountService.create({ ...context, draft })).rejects.toThrow();
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe("damaged raw bytes");
  });
  it("persists creation and rejects unsupported teaching assignments", async () => {
    const created = await accountService.create({ ...context, draft });
    expect(created.id).not.toBe("anna-smirnova");
    expect(readAccountsState()).toMatchObject({ revision: 1, error: "" });
    await expect(accountService.create({ ...context, expectedRevision: 1, draft: { ...draft, login: "other.student", memberships: [{ subjectId: "data-analysis", groupIds: ["nonexistent"] }] } })).rejects.toThrow("недоступное");
    expect(readAccountsState().accounts).toHaveLength(4);
  });
  it("rechecks revisions after asynchronous external guards", async () => {
    const unregister = registerAccountRoleChangeGuard(async () => {
      const state = createInitialAccountsDocument();
      state.revision = 1;
      values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    });
    try {
      await expect(accountService.changeRole({ ...context, accountId: "teacher-elena-volkova", accountRevision: 1, role: "configurator", memberships: [] })).rejects.toThrow("изменились");
      expect(readAccountsState().accounts[0].role).toBe("teacher");
    } finally { unregister(); }
  });
  it("rejects forbidden role changes without modifying storage", async () => {
    const unregister = registerAccountRoleChangeGuard(() => { throw new Error("Переназначьте будущие занятия."); });
    try {
      await expect(accountService.changeRole({ ...context, accountId: "teacher-elena-volkova", accountRevision: 1, role: "configurator", memberships: [] })).rejects.toThrow("будущие");
      expect(values.size).toBe(0);
    } finally { unregister(); }
  });
  it("persists assignments on the account with audit, validating the catalog and latest author revision", async () => {
    const command = { ...context, accountId: "teacher-elena-volkova", accountRevision: 1, memberships: [{ subjectId: "data-analysis", groupIds: ["411-bi"] }] };
    const updated = await accountService.updateAssignments(command);
    expect(updated).toMatchObject({ id: command.accountId, role: "teacher", revision: 2, memberships: command.memberships });
    expect(readAccountsState().revision).toBe(1);
    expect(JSON.parse(values.get(ACCOUNTS_STORAGE_KEY)!).history[0].action).toBe("assignments-changed");
    await expect(accountService.updateAssignments(command)).rejects.toThrow("изменились");
    await expect(accountService.updateAssignments({ ...command, expectedRevision: 1, accountRevision: 2, memberships: [{ subjectId: "data-analysis", groupIds: ["unknown"] }] })).rejects.toThrow("недоступное");
  });
  it("prevents guarded teaching assignment removal and rechecks after asynchronous guards", async () => {
    const command = { ...context, accountId: "teacher-elena-volkova", accountRevision: 1, memberships: [] };
    const unregister = registerTeachingAssignmentGuard(() => { throw new Error("Есть будущие пары по этой группе."); });
    try { await expect(accountService.updateAssignments(command)).rejects.toThrow("будущие"); expect(values.size).toBe(0); }
    finally { unregister(); }
    const unregisterAsync = registerTeachingAssignmentGuard(async () => { const state = createInitialAccountsDocument(); state.revision = 1; values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(state)); });
    try { await expect(accountService.updateAssignments(command)).rejects.toThrow("изменились"); expect(readAccountsState().accounts[0].memberships).not.toEqual([]); }
    finally { unregisterAsync(); }
  });
});
