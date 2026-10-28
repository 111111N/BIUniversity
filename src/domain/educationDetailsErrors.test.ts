import { describe, expect, it } from "vitest";
import { getEducationDetailsErrors, normalizeEducationDetails, type EducationEventDetails } from "./studentEducationEvent";

const now = "2026-10-28T10:00:00Z";
const details: EducationEventDetails = { effectiveDate: "2026-10-28", basis: "Приказ о зачислении", documentNumber: "15-У", documentDate: "2026-10-27" };
describe("shared education field errors", () => {
  it("reports all fields in the existing service priority without changing entered values", () => {
    const input = { effectiveDate: "2026-10-29", basis: " ", documentNumber: "x".repeat(81), documentDate: "2026-02-30" }; const original = { ...input };
    const errors = getEducationDetailsErrors(input, now);
    expect(errors.map((error) => error.field)).toEqual(["effectiveDate", "basis", "documentNumber", "documentDate"]);
    expect(() => normalizeEducationDetails(input, now)).toThrow(errors[0].message); expect(input).toEqual(original);
  });
  it.each([
    { patch: { effectiveDate: "2026-02-30" }, field: "effectiveDate" },
    { patch: { effectiveDate: "2026-10-29" }, field: "effectiveDate" },
    { patch: { effectiveDate: "" }, field: "effectiveDate" },
    { patch: { basis: " аб " }, field: "basis" },
    { patch: { basis: "я".repeat(501) }, field: "basis" },
    { patch: { documentNumber: "x".repeat(81) }, field: "documentNumber" },
    { patch: { documentDate: "2026-10-29" }, field: "documentDate" },
    { patch: { documentDate: "bad" }, field: "documentDate" },
  ])("matches service rejection for $field: $patch", ({ patch, field }) => {
    const input = { ...details, ...patch }; const errors = getEducationDetailsErrors(input, now);
    expect(errors).toHaveLength(1); expect(errors[0].field).toBe(field);
    expect(() => normalizeEducationDetails(input, now)).toThrow(errors[0].message);
  });
  it.each([
    { basis: " абв ", documentNumber: "", documentDate: "" },
    { basis: ` ${"я".repeat(500)} `, documentNumber: ` ${"x".repeat(80)} ` },
    { effectiveDate: "2024-02-29", documentDate: "2024-02-29" },
    { documentNumber: undefined, documentDate: undefined },
  ])("keeps accepted boundaries, trimming and optional fields: %j", (patch) => {
    const input = { ...details, ...patch };
    expect(getEducationDetailsErrors(input, now)).toEqual([]);
    expect(() => normalizeEducationDetails(input, now)).not.toThrow();
    expect(normalizeEducationDetails(input, now).basis).toBe(input.basis.trim());
  });
  it("uses the Moscow day for both dates when the UTC date is still yesterday", () => {
    const input = { ...details, effectiveDate: "2026-10-29", documentDate: "2026-10-29" };
    expect(getEducationDetailsErrors(input, "2026-10-28T20:59:00Z").map((error) => error.field)).toEqual(["effectiveDate", "documentDate"]);
    expect(getEducationDetailsErrors(input, "2026-10-28T21:00:00Z")).toEqual([]);
  });
  it("retains the existing first rejection for malformed runtime data", () => {
    for (const value of [undefined, { ...details, basis: null }, { ...details, documentNumber: 15 }]) {
      const input = value as unknown as EducationEventDetails;
      const errors = getEducationDetailsErrors(input, now);
      expect(errors).toHaveLength(1); expect(() => normalizeEducationDetails(input, now)).toThrow(errors[0].message);
    }
  });
});
