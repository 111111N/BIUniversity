import { describe, expect, it } from "vitest";
import { matchesSearchOption } from "./search";

describe("catalogue option search", () => {
  it("matches words across the label and aliases in any order", () => {
    const option = { label: "Теория вероятностей", searchText: "ТВ" };
    expect(matchesSearchOption(option, "тв теория")).toBe(true);
    expect(matchesSearchOption(option, "вероятностей теория")).toBe(true);
    expect(matchesSearchOption(option, "тв статистика")).toBe(false);
  });
  it("normalizes Cyrillic spelling, spacing and compatibility characters", () => {
    expect(matchesSearchOption({ label: "Алёна Фёдорова", searchText: "alena.fedorova" }, "  ФЕДОРОВА алена  ")).toBe(true);
    expect(matchesSearchOption({ label: "Группа 112 МКО" }, "мко １１２")).toBe(true);
    expect(matchesSearchOption({ label: "Математика" }, " \t ")).toBe(true);
  });
  it("does not include opaque record IDs in user search", () => {
    const option = { value: "teacher-23", label: "Алёна Фёдорова" };
    expect(matchesSearchOption(option, "teacher-23")).toBe(false);
  });
});
