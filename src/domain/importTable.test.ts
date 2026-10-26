import { describe, expect, it } from "vitest";
import { mapStudentImportRows, MAX_IMPORT_CHARACTERS, parseImportTable, suggestStudentImportMapping } from "./importTable";

describe("student list table parsing", () => {
  it("reads an Excel paste with CRLF, a BOM, empty lines and physical source line numbers", () => {
    const table = parseImportTable('\uFEFFФИО\tЛогин\tГруппа\r\n\r\nАнна Смирнова\tanna.new\t112-МКо\r\n');
    expect(table.delimiter).toBe("\t");
    expect(table.records[1]).toEqual({ line: 3, cells: ["Анна Смирнова", "anna.new", "112-МКо"] });
    expect(mapStudentImportRows(table, suggestStudentImportMapping(table.records[0].cells), true)).toEqual([{ line: 3, name: "Анна Смирнова", login: "anna.new", group: "112-МКо", campus: "", email: "" }]);
  });
  it("handles quoted delimiters, escaped quotes and quoted newlines", () => {
    const table = parseImportTable('ФИО;Логин;Почта\n"Анна; ""Смирнова""\nИвановна";anna.new;"student@example.test"\nИван;ivan.new;');
    expect(table.delimiter).toBe(";");
    expect(table.records[1].cells[0]).toBe('Анна; "Смирнова"\nИвановна');
    expect(table.records[2].line).toBe(4);
  });
  it("does not count quoted commas when choosing a separator", () => {
    expect(parseImportTable('"ФИО, имя";Логин\n"Анна, Ивановна";anna.new').delimiter).toBe(";");
    expect(parseImportTable('name,login\n"Student, First",student.first').records[1].cells).toEqual(["Student, First", "student.first"]);
  });
  it("allows explicit delimiters and headerless mapping", () => {
    const table = parseImportTable("Анна;anna.new\nИван;ivan.new", ";");
    expect(mapStudentImportRows(table, { name: 0, login: 1, group: -1, campus: -1, email: -1 }, false)).toHaveLength(2);
    expect(suggestStudentImportMapping(["Full name", "Username", "Group name", "Building", "E-mail"])).toEqual({ name: 0, login: 1, group: 2, campus: 3, email: 4 });
  });
  it.each(['ФИО;Логин\n"Не закрыто;login', 'ФИО;Логин\n"Имя"wrong;login', 'ФИО;Логин\nИмя"quoted;login'])('rejects malformed quoted data: %s', (source) => {
    expect(() => parseImportTable(source)).toThrow("Строка 2");
  });
  it("refuses missing or duplicated mappings and a header without students", () => {
    const table = parseImportTable("ФИО;Логин\nАнна;anna.new");
    expect(() => mapStudentImportRows(table, { name: 0, login: -1, group: -1, campus: -1, email: -1 }, true)).toThrow("ФИО и логином");
    expect(() => mapStudentImportRows(table, { name: 0, login: 0, group: -1, campus: -1, email: -1 }, true)).toThrow("отдельный");
    expect(() => mapStudentImportRows(table, { name: 0, login: 1, group: -2, campus: -1, email: -1 }, true)).toThrow("отдельный");
    expect(() => mapStudentImportRows(table, { name: 0, login: 1, group: NaN, campus: -1, email: -1 }, true)).toThrow("отдельный");
    const header = parseImportTable("ФИО;Логин");
    expect(() => mapStudentImportRows(header, suggestStudentImportMapping(header.records[0].cells), true)).toThrow("нет студентов");
  });
  it("limits data size, columns and data rows instead of silently truncating", () => {
    expect(() => parseImportTable("x".repeat(MAX_IMPORT_CHARACTERS + 1))).toThrow("слишком большой");
    expect(() => parseImportTable(Array.from({ length: 65 }, () => "x").join(";"))).toThrow("64 столбцов");
    const table = parseImportTable(Array.from({ length: 1001 }, (_, index) => `Студент ${index};student.${index}`).join("\n"));
    expect(() => mapStudentImportRows(table, { name: 0, login: 1, group: -1, campus: -1, email: -1 }, false)).toThrow("1000");
  });
});
