import { describe, expect, it } from "vitest";
import { getSubjectDraftErrors, validateSubjectDraft, type SubjectDefinition, type SubjectDraft } from "./subjectCatalog";

const subjects: SubjectDefinition[] = [{ id: "probability", name: "Теория вероятностей", shortName: "ТВ", semester: "", color: "red" }];
const draft = { name: "Иностранный язык", shortName: "ИЯ" };

describe("shared subject creation validation", () => {
  it("returns both field errors without changing the entered text or catalog", () => {
    const input = { name: " ", shortName: " " }; const before = structuredClone({ input, subjects });
    expect(getSubjectDraftErrors(input, subjects).map((error) => error.field)).toEqual(["name", "shortName"]);
    expect({ input, subjects }).toEqual(before);
  });
  it.each([
    { patch: { name: "А" }, field: "name", message: "от 2 до 160" },
    { patch: { name: "А".repeat(161) }, field: "name", message: "от 2 до 160" },
    { patch: { shortName: " " }, field: "shortName", message: "от 1 до 24" },
    { patch: { shortName: "А".repeat(25) }, field: "shortName", message: "от 1 до 24" },
    { patch: { name: " теория   ВЕРОЯТНОСТЕЙ " }, field: "name", message: "названием уже существует" },
    { patch: { shortName: " тв " }, field: "shortName", message: "сокращение уже используется" },
  ])("keeps the existing service rejection for $field: $message", ({ patch, field, message }) => {
    const input = { ...draft, ...patch }; const errors = getSubjectDraftErrors(input, subjects);
    expect(errors).toHaveLength(1); expect(errors[0]).toMatchObject({ field }); expect(errors[0].message).toContain(message);
    expect(() => validateSubjectDraft(input, subjects)).toThrow(errors[0].message);
  });
  it.each([
    { name: "Ая", shortName: "Я" }, { name: "А".repeat(160), shortName: "Я".repeat(24) },
    { name: "  Иностранный   язык  ", shortName: " ＡＢ " },
  ])("accepts existing boundaries and normalized values: %j", (input) => {
    expect(getSubjectDraftErrors(input, subjects)).toEqual([]);
    expect(() => validateSubjectDraft(input, subjects)).not.toThrow();
  });
  it("detects Unicode-equivalent abbreviations and gives length errors their previous priority", () => {
    const catalog = [{ ...subjects[0], shortName: "ab" }];
    expect(getSubjectDraftErrors({ ...draft, shortName: " ＡＢ " }, catalog)[0].field).toBe("shortName");
    const input = { name: subjects[0].name, shortName: "" };
    expect(getSubjectDraftErrors(input, subjects).map((error) => error.field)).toEqual(["shortName", "name"]);
    expect(() => validateSubjectDraft(input, subjects)).toThrow("от 1 до 24");
  });
  it("preserves malformed-field rejection before length checks and keeps metadata checks separate", () => {
    const invalid = { name: "", shortName: null } as unknown as SubjectDraft;
    expect(getSubjectDraftErrors(invalid, subjects)).toEqual([{ field: "shortName", message: "Заполните название и сокращение дисциплины." }]);
    expect(() => validateSubjectDraft(invalid, subjects)).toThrow("Заполните название и сокращение дисциплины.");
    expect(getSubjectDraftErrors({ ...draft, color: "unknown" } as unknown as SubjectDraft, subjects)).toEqual([]);
    expect(() => validateSubjectDraft({ ...draft, color: "unknown" } as unknown as SubjectDraft, subjects)).toThrow("неизвестный цвет");
    expect(() => validateSubjectDraft({ ...draft, semester: "А".repeat(161) }, subjects)).toThrow("описание дисциплины");
  });
});
