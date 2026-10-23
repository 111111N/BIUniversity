import { afterEach, describe, expect, it, vi } from "vitest";
import * as accounts from "./accountStore";
import * as schedule from "./managedScheduleStore";
import { connectAdministrationPolicies } from "./administrationIntegration";
import type { PortalAccount, UserRole } from "../domain/accounts";

afterEach(() => vi.restoreAllMocks());
describe("administration module policy", () => {
  it("blocks a teacher role change while future published lessons still reference the teacher", () => {
    let check: (account: PortalAccount, role: UserRole) => void | Promise<void> = () => undefined;
    const unregister = vi.fn();
    vi.spyOn(accounts, "registerAccountRoleChangeGuard").mockImplementation((guard) => { check = guard; return unregister; });
    const future = vi.spyOn(schedule, "hasFuturePublishedTeaching").mockReturnValue(true);
    const stop = connectAdministrationPolicies();
    const teacher: PortalAccount = { id: "teacher-new", name: "Teacher", login: "teacher.new", role: "teacher", revision: 1, memberships: [] };
    expect(() => check(teacher, "student")).toThrow("будущие занятия");
    expect(future).toHaveBeenCalledWith("teacher-new");
    future.mockReturnValue(false);
    expect(() => check(teacher, "student")).not.toThrow();
    stop();
    expect(unregister).toHaveBeenCalledOnce();
  });
});
