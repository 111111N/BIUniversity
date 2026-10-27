import { describe, expect, it } from "vitest";
import { changeAccountRole, changeAccountStatus, getAccountBlockRestriction, getAccountRoleRestriction, type AccountsDocument, type PortalAccount } from "./accounts";

const actor: PortalAccount = { id: "admin", role: "configurator", name: "Настройщик", login: "admin", revision: 1, memberships: [] };
const state = (accounts: PortalAccount[]): AccountsDocument => ({ version: 1, revision: 0, accounts, history: [] });
const context = { actorId: actor.id, actorRevision: 1, expectedRevision: 0, accountId: actor.id, accountRevision: 1 };
const date = "2026-10-27T09:00:00Z";
describe("shared access restrictions", () => {
  it("keeps the self-block restriction and write-command error identical without modifying data", () => {
    const source = state([actor]);
    const reason = getAccountBlockRestriction(actor, actor.id, source.accounts);
    expect(reason).toContain("свою текущую");
    expect(() => changeAccountStatus(source, { ...context, status: "blocked" }, "audit", date)).toThrow(reason);
    expect(source.history).toHaveLength(0); expect(source.accounts[0].status).toBeUndefined();
  });
  it("keeps the last configurator protected while ignoring blocked configurators as replacements", () => {
    const source = state([actor, { ...actor, id: "blocked", login: "blocked", status: "blocked" }]);
    const reason = getAccountRoleRestriction(actor, "teacher", source.accounts);
    expect(reason).toContain("последнего настройщика");
    expect(() => changeAccountRole(source, { ...context, role: "teacher", memberships: [] }, "audit", date)).toThrow(reason);
    expect(getAccountBlockRestriction(actor, "other-actor", source.accounts)).toContain("последнего активного настройщика");
  });
  it("allows a role change when another active configurator remains, and does not apply block rules to restoring access", () => {
    const second = { ...actor, id: "second", login: "second" };
    const source = state([actor, second]);
    expect(getAccountRoleRestriction(actor, "teacher", source.accounts)).toBe("");
    expect(changeAccountRole(source, { ...context, role: "teacher", memberships: [] }, "audit", date).accounts[0].role).toBe("teacher");
    const blocked = { ...second, status: "blocked" as const };
    expect(changeAccountStatus(state([actor, blocked]), { ...context, accountId: blocked.id, status: "active" }, "restore", date).accounts[1].status).toBe("active");
    expect(source.accounts[0].role).toBe("configurator");
  });
});
