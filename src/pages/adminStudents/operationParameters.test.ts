import { describe, expect, it } from "vitest";
import { getStudentTransferGroupProblem, previewStudentBulk } from "../../domain/studentBulk";
import { normalizeEducationDetails } from "../../domain/studentEducationEvent";
import { createInitialAccountsDocument } from "../../data/accountStore";
import { getStudentOperationBlockReason, getStudentOperationProblems, type StudentOperationParameters } from "./operationParameters";

const now = "2026-10-28T10:00:00Z";
const groups = [{ id: "112-mko", name: "112-МКо" }, { id: "active", name: "113-МКо" }, { id: "archived", name: "Архив", status: "archived" as const }];
const parameters: StudentOperationParameters = { kind: "transfer", targetGroupId: "active", education: { effectiveDate: "2026-09-01", basis: "Приказ", documentNumber: "15-У", documentDate: "2026-08-30" } };
describe("student operation parameter validation", () => {
  it("reports all missing fields in form order without changing the document or group list", () => {
    const input = { ...parameters, targetGroupId: "", education: { effectiveDate: "", basis: " ", documentNumber: "x".repeat(81), documentDate: "2026-10-29" } };
    const original = structuredClone({ input, groups });
    expect(getStudentOperationProblems(input, groups, now).map((problem) => problem.field)).toEqual(["targetGroup", "effectiveDate", "basis", "documentNumber", "documentDate"]);
    expect({ input, groups }).toEqual(original);
  });
  it.each(["", "missing", "archived"])("uses the batch domain's rejection for an unavailable transfer target: %s", (targetGroupId) => {
    const input = { ...parameters, targetGroupId }; const problems = getStudentOperationProblems(input, groups, now);
    expect(problems).toEqual([{ field: "targetGroup", message: getStudentTransferGroupProblem(groups.find((group) => group.id === targetGroupId)) }]);
    if (targetGroupId) {
      const plan = previewStudentBulk(createInitialAccountsDocument(), groups, { targets: [{ accountId: "anna-smirnova", revision: 1 }], action: { kind: "transfer", groupId: targetGroupId }, education: input.education }, now);
      expect(plan.rows[0].errors).toContain(problems[0].message);
    }
  });
  it.each(["graduated", "withdrawn"] as const)("does not require or apply a transfer group for %s", (kind) => {
    expect(getStudentOperationProblems({ ...parameters, kind, targetGroupId: "missing" }, [], now)).toEqual([]);
  });
  it.each([
    { effectiveDate: "2026-10-29" }, { effectiveDate: "2026-02-30" }, { basis: " аб " }, { basis: "x".repeat(501) },
    { documentDate: "2026-10-29" }, { documentNumber: "x".repeat(81) },
  ])("keeps document validation shared with the service: %j", (patch) => {
    const education = { ...parameters.education, ...patch }; const problems = getStudentOperationProblems({ ...parameters, education }, groups, now);
    expect(problems).toHaveLength(1); expect(() => normalizeEducationDetails(education, now)).toThrow(problems[0].message);
  });
  it("accepts corrected values without silently trimming the entered document", () => {
    const input = { ...parameters, education: { ...parameters.education, basis: "  Приказ  " } };
    expect(getStudentOperationProblems(input, groups, now)).toEqual([]); expect(input.education.basis).toBe("  Приказ  ");
  });
});
describe("student operation block explanations", () => {
  const ready = { busy: false, unavailable: false, actorAvailable: true, count: 1 };
  it.each([
    { patch: { busy: true }, message: "Проверяем" },
    { patch: { unavailable: true }, message: "Повторить чтение" },
    { patch: { actorAvailable: false }, message: "настройщика" },
    { patch: { count: 0 }, message: "выберите студентов" },
    { patch: { count: 1001 }, message: "больше 1000" },
  ])("explains a blocked preview: $message", ({ patch, message }) => {
    expect(getStudentOperationBlockReason({ ...ready, ...patch })).toContain(message);
  });
  it("keeps the service limit available and prioritizes an in-flight check", () => {
    expect(getStudentOperationBlockReason({ ...ready, count: 1000 })).toBe("");
    expect(getStudentOperationBlockReason({ ...ready, busy: true, unavailable: true, count: 0 })).toContain("Проверяем");
  });
});
