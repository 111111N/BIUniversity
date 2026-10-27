import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountService, ACCOUNTS_STORAGE_KEY, createInitialAccountsDocument, readAccountsState } from "../../data/accountStore";
import { ACADEMIC_GROUPS, refreshAcademicCatalog } from "../../data/academicCatalog";
import { getStudentGroupId } from "../../domain/accounts";
import { getEducationOperationProblem, prepareEducationOperation, type EducationOperation } from "./educationOperationModel";

let values: Map<string, string>;
let writes: number;
const now = "2026-10-27T10:00:00Z";
const actor = { actorId: "configurator-demo", actorRevision: 1 };
beforeEach(() => {
  values = new Map(); writes = 0;
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes++; values.set(key, value); } });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", {});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers(); vi.setSystemTime(new Date(now)); refreshAcademicCatalog();
  const initial = createInitialAccountsDocument();
  initial.accounts.find((entry) => entry.id === "anna-smirnova")!.status = "blocked";
  values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(initial));
});
afterEach(() => { values.clear(); refreshAcademicCatalog(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const prepare = (operation: EducationOperation, effectiveDate: string, targetGroup?: string) => {
  const state = readAccountsState();
  const student = state.accounts.find((entry) => entry.id === "anna-smirnova")!;
  const draft = prepareEducationOperation(student, student, operation);
  if (targetGroup) { draft.studentGroupId = targetGroup; draft.memberships = []; }
  const education = { effectiveDate, basis: "Приказ ректора", documentNumber: "15-У" };
  const problem = getEducationOperationProblem(student, draft, operation, education, state.educationEvents.filter((event) => event.accountId === student.id), ACADEMIC_GROUPS, now);
  const command = { ...actor, expectedRevision: state.revision, accountId: student.id, accountRevision: student.revision, education, details: { name: draft.name, login: draft.login, memberships: draft.memberships, studentGroupId: draft.studentGroupId, enrollmentStatus: draft.enrollmentStatus } };
  return { problem, command };
};

describe("education operation UI preparation with the existing service", () => {
  it("saves transfer and completed-state changes as distinct events without issuing a number or restoring login access", async () => {
    await accountService.confirmAdmission({ ...actor, expectedRevision: 0, accountId: "anna-smirnova", accountRevision: 1, expectedGroupRevision: 0, education: { effectiveDate: "2026-09-01", basis: "Приказ о зачислении" } });
    const operations: [EducationOperation, string, string?][] = [
      ["transfer", "2026-10-01", "113-mko"],
      ["graduate", "2026-10-02"],
      ["withdraw", "2026-10-03"],
      ["reinstate", "2026-10-04"],
    ];
    for (const [operation, date, target] of operations) {
      const prepared = prepare(operation, date, target);
      expect(prepared.problem).toBe("");
      const updated = await accountService.updateDetails(prepared.command);
      expect(updated.status).toBe("blocked"); expect(updated.studentRecord).toBeUndefined();
      expect(getStudentGroupId(updated)).toBe("113-mko");
    }
    const state = readAccountsState();
    expect(state.error).toBe(""); expect(writes).toBe(5);
    expect(state.educationEvents.map((event) => event.kind)).toEqual(["admitted", "transferred", "graduated", "withdrawn", "reinstated"]);
    expect(state.history).toHaveLength(5);
    expect(state.educationEvents.at(-1)?.after).toMatchObject({ groupId: "113-mko", enrollment: "studying" });
  });

  it("shows chronology failure before confirmation and still rejects stale-date commands without any write", async () => {
    const first = prepare("graduate", "2026-10-26");
    expect(first.problem).toBe(""); await accountService.updateDetails(first.command);
    const before = values.get(ACCOUNTS_STORAGE_KEY);
    const invalid = prepare("reinstate", "2026-10-25");
    expect(invalid.problem).toContain("раньше последнего события");
    await expect(accountService.updateDetails(invalid.command)).rejects.toThrow("раньше последнего события");
    expect(values.get(ACCOUNTS_STORAGE_KEY)).toBe(before); expect(writes).toBe(1);
  });

  it("keeps the previously issued permanent student number during graduation", async () => {
    const initial = createInitialAccountsDocument();
    const record = { number: "202630015", year: 2026, campus: 3, sequence: 15, issuedAt: "2026-09-01T10:00:00Z" };
    initial.accounts.find((entry) => entry.id === "anna-smirnova")!.studentRecord = record;
    values.set(ACCOUNTS_STORAGE_KEY, JSON.stringify(initial));
    const prepared = prepare("graduate", "2026-10-26");
    expect(prepared.problem).toBe("");
    const updated = await accountService.updateDetails(prepared.command);
    expect(updated.studentRecord).toEqual(record); expect(writes).toBe(1);
  });
});
