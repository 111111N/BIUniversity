import { describe, expect, it } from "vitest";
import { parseImportTable } from "../../domain/importTable";
import { getImportColumns, getImportColumnExamples, getImportMappingState } from "./mappingPresentation";
const mapping = { name: 0, login: 1, group: -1, campus: -1, email: -1 };
describe("import column review", () => {
  it("shows actual data rather than headers with their original source lines", () => {
    const table = parseImportTable('ФИО;Логин\r\n"Иванов\nИван";ivanov\r\nПетров;petr');
    expect(getImportColumnExamples(table, 0, true)).toEqual([{ line: 2, value: "Иванов\nИван" }, { line: 4, value: "Петров" }]);
    expect(getImportColumnExamples(table, -1, true)).toEqual([]);
    expect(getImportMappingState(table, mapping, true)).toEqual({ count: 2, error: "" });
  });
  it("retains the first student when no header is present", () => {
    const table = parseImportTable("Иванов;ivanov\nПетров;petr");
    expect(getImportColumnExamples(table, 0, false)[0]).toEqual({ line: 1, value: "Иванов" });
    expect(getImportColumns(table, false)[0].label).toBe("1. Столбец 1");
    expect(getImportMappingState(table, mapping, false).count).toBe(2);
  });
  it("uses domain checks for duplicated, missing and header-only mappings", () => {
    const table = parseImportTable("ФИО;Логин\nИванов;ivanov");
    expect(getImportMappingState(table, { ...mapping, login: 0 }, true).error).toContain("отдельный");
    expect(getImportMappingState(table, { ...mapping, login: -1 }, true).error).toContain("ФИО и логином");
    expect(getImportMappingState(parseImportTable("ФИО;Логин"), mapping, true).error).toContain("нет студентов");
    expect(getImportMappingState(null, mapping, true).count).toBe(0);
  });
});
