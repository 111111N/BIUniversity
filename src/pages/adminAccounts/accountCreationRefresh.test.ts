import { describe, expect, it } from "vitest";
import { createInitialAccountsDocument } from "../../data/accountStore";
import { refreshAccountCreation, type AccountCreationEditor } from "./accountCreationRefresh";

const source = () => ({ ...createInitialAccountsDocument(), actorId: "configurator-demo" });
const editor = (): AccountCreationEditor => ({ draft: { name: " Мои данные ", login: "my.student", email: "student@example.test", role: "student", memberships: [], studentGroupId: "112-mko", studentCampus: 3 }, baseline: JSON.stringify({ name: "", login: "", role: "student", memberships: [] }), actorId: "configurator-demo", actorRevision: 1, revision: 0 });

describe("refresh creation without discarding input", () => {
  it("updates versions while keeping every entered field and the original dirty baseline", () => {
    const input = editor(); const latest = source(); latest.revision = 5; latest.accounts.find((entry) => entry.id === latest.actorId)!.revision = 2;
    const original = structuredClone({ input, latest });
    const refreshed = refreshAccountCreation(input, latest);
    expect(refreshed).toMatchObject({ revision: 5, actorRevision: 2, draft: input.draft, baseline: input.baseline });
    expect(JSON.stringify(refreshed.draft)).not.toBe(refreshed.baseline);
    expect({ input, latest }).toEqual(original);
  });
  it("also preserves new teacher/configurator drafts and detached assignments", () => {
    for (const role of ["teacher", "configurator"] as const) {
      const input = editor(); input.draft.role = role;
      input.draft.memberships = [{ subjectId: "subject", groupIds: ["group"] }];
      const refreshed = refreshAccountCreation(input, source());
      expect(refreshed.draft.role).toBe(role);
      refreshed.draft.memberships[0].groupIds.push("another");
      expect(input.draft.memberships[0].groupIds).toEqual(["group"]);
    }
  });
  it.each(["error", "missing-actor", "blocked-actor", "changed-role", "changed-user"])("keeps the input on %s", (reason) => {
    const input = editor(); const latest = { ...source(), error: "" };
    if (reason === "error") latest.error = "Ошибка чтения источника";
    if (reason === "missing-actor") latest.accounts = latest.accounts.filter((entry) => entry.id !== latest.actorId);
    if (reason === "blocked-actor") latest.accounts.find((entry) => entry.id === latest.actorId)!.status = "blocked";
    if (reason === "changed-role") latest.accounts.find((entry) => entry.id === latest.actorId)!.role = "teacher";
    if (reason === "changed-user") { latest.accounts.push({ ...latest.accounts[2], id: "other", login: "other.admin" }); latest.actorId = "other"; }
    const original = structuredClone(input);
    expect(() => refreshAccountCreation(input, latest)).toThrow(); expect(input).toEqual(original);
  });
});
