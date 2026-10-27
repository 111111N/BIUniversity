import { describe, expect, it } from "vitest";
import { getGroupDraftErrors, validateGroupDraft, type GroupDraft } from "./groupCatalog";

const valid = { name: "101-ИВТ", course: 1, campus: 1, admissionYear: 2026 };
describe("shared group field validation", () => {
  it("returns field-specific messages in the existing command error order", () => {
    const invalid = { name: " ", course: 0, campus: 0, admissionYear: 26 };
    const errors = getGroupDraftErrors(invalid);
    expect(errors.map((error) => error.field)).toEqual(["name", "course", "campus", "admissionYear"]);
    expect(() => validateGroupDraft(invalid)).toThrow(errors[0].message);
    expect(() => validateGroupDraft({ ...invalid, name: valid.name })).toThrow(errors[1].message);
    expect(() => validateGroupDraft({ ...invalid, name: valid.name, course: 1 })).toThrow(errors[2].message);
  });
  it.each([
    ["name", "x"], ["name", "x".repeat(81)], ["name", null],
    ["course", 1.5], ["course", 13], ["course", NaN],
    ["campus", 10], ["campus", 1.5], ["admissionYear", 1899], ["admissionYear", 2200], ["admissionYear", 2026.5],
  ])("uses the same UI and command rule for %s=%s", (field, value) => {
    const draft = { ...valid, [field]: value } as GroupDraft;
    const errors = getGroupDraftErrors(draft);
    expect(errors).toHaveLength(1); expect(errors[0].field).toBe(field);
    expect(() => validateGroupDraft(draft)).toThrow(errors[0].message);
  });
  it("preserves accepted boundaries and normalized names without modifying the input", () => {
    const draft = { name: "  １０１-ИВТ  ", course: 12, campus: 9, admissionYear: 2199 };
    expect(getGroupDraftErrors(draft)).toEqual([]);
    expect(validateGroupDraft(draft)).toEqual({ ...draft, name: "101-ИВТ" });
    expect(validateGroupDraft({ ...valid, admissionYear: 1900 }).admissionYear).toBe(1900);
    expect(draft.name).toBe("  １０１-ИВТ  ");
  });
});
