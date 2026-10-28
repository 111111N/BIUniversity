import { describe, expect, it } from "vitest";
import { mapStudentImportRows, parseImportTable, type ImportDelimiter } from "../../domain/importTable";
import { applyStudentImport, previewStudentImport } from "../../domain/studentImport";
import { createInitialAccountsDocument } from "../../data/accountStore";
import { replaceImportRow, type ImportRowDraft } from "./rowEditing";

const mapping = { name: 0, login: 1, group: -1, campus: -1, email: -1 };
const draft: ImportRowDraft = { name: "Новый Студент", login: "new.student", group: "", campus: "", email: "" };

describe("correction of one source record", () => {
  it.each(["\r\n", "\n", "\r"])("preserves BOM, header, blank lines, unknown columns and surrounding bytes with %j newlines", (newline) => {
    const before = `\uFEFFФИО;Логин;Примечание${newline}${newline}`;
    const after = `${newline}${newline}Петров;petr;"не менять; кавычки"${newline}`;
    const source = `${before}Иванов;duplicate;"строка; с ""кавычками"""${after}`;
    const corrected = replaceImportRow(source, ";", mapping, true, 3, draft);
    expect(corrected).toBe(`${before}Новый Студент;new.student;"строка; с ""кавычками"""${after}`);
  });
  it("replaces a multiline record, retaining mixed line endings around it", () => {
    const source = '\uFEFFФИО;Логин;Другое\r\n\n"Иванов\r\nИван";old;"первая\r\nвторая"\rПетров;petr;keep\n';
    const corrected = replaceImportRow(source, ";", mapping, true, 3, { ...draft, name: 'Имя; "Новое"\nОтчество' });
    expect(corrected).toBe('\uFEFFФИО;Логин;Другое\r\n\n"Имя; ""Новое""\r\nОтчество";new.student;"первая\r\nвторая"\rПетров;petr;keep\n');
    expect(mapStudentImportRows(parseImportTable(corrected, ";"), mapping, true).map((row) => row.line)).toEqual([3, 6]);
  });
  it.each(["\t", ";", ","] as ImportDelimiter[])("supports %j and no-header sources with escaped values", (delimiter) => {
    const source = `Иванов${delimiter}old\nПетров${delimiter}petr`;
    const corrected = replaceImportRow(source, delimiter, mapping, false, 1, { ...draft, name: `Фамилия${delimiter}Имя` });
    const rows = mapStudentImportRows(parseImportTable(corrected, delimiter), mapping, false);
    expect(rows[0]).toMatchObject({ name: `Фамилия${delimiter}Имя`, login: "new.student" });
    expect(corrected.endsWith(`\nПетров${delimiter}petr`)).toBe(true);
  });
  it("fills short rows at mapped positions without overwriting other columns", () => {
    const mapped = { name: 0, login: 3, group: 2, campus: -1, email: -1 };
    const source = "ФИО;Другое;Группа;Логин\nИванов;keep\nПетров;other;101;petr";
    const corrected = replaceImportRow(source, ";", mapped, true, 2, { ...draft, group: "112-МКо" });
    expect(corrected).toContain("Новый Студент;keep;112-МКо;new.student");
    expect(corrected.endsWith("\nПетров;other;101;petr")).toBe(true);
  });
  it("refuses headers, blank lines, absent rows, invalid mappings and empty-record deletion", () => {
    const source = "ФИО;Логин\n\nИванов;old\nПетров;petr";
    for (const line of [1, 2, 4.5, 99]) expect(() => replaceImportRow(source, ";", mapping, true, line, draft)).toThrow("Строка больше не найдена");
    expect(() => replaceImportRow(source, ";", { ...mapping, login: 0 }, true, 3, draft)).toThrow("отдельный");
    expect(() => replaceImportRow(source, ";", mapping, true, 3, { ...draft, name: "", login: "" })).toThrow("полностью пустой");
    expect(() => replaceImportRow(source, ";", mapping, true, 3, { ...draft, name: "a".repeat(501) })).toThrow("500");
    expect(source).toContain("Иванов;old");
  });
  it("keeps unmapped fields in source untouched, even if the supplied draft contains other values", () => {
    const source = "ФИО;Логин;Почта\nИванов;old;original@example.test";
    expect(replaceImportRow(source, "auto", mapping, true, 2, { ...draft, email: "changed@example.test" })).toBe("ФИО;Логин;Почта\nНовый Студент;new.student;original@example.test");
  });
});

describe("correction followed by complete domain review", () => {
  const groups = [{ id: "112-mko", name: "112-МКо", campus: 3 }];
  const date = "2026-10-28T10:00:00Z";
  const request = (source: string) => ({ rows: mapStudentImportRows(parseImportTable(source, ";"), mapping, true), defaultGroupId: "112-mko", defaultCampus: null });
  it("clears both duplicate errors and recalculates every proposed number without saving accounts", () => {
    const state = createInitialAccountsDocument();
    const original = structuredClone(state);
    const source = "ФИО;Логин\nПервый Студент;duplicate\nВторой Студент;duplicate\nТретий Студент;third.student";
    const previous = previewStudentImport(state, groups, request(source), date);
    expect(previous.errors).toBe(2);
    expect(previous.rows[2].studentNumber).toBe("202630001");
    const corrected = replaceImportRow(source, ";", mapping, true, 2, draft);
    const next = previewStudentImport(state, groups, request(corrected), date);
    expect(next.errors).toBe(0); expect(next.ready).toBe(3);
    expect(next.rows.map((row) => row.studentNumber)).toEqual(["202630001", "202630002", "202630003"]);
    expect(state).toEqual(original);
  });
  it("retains unrelated errors and the atomic prohibition on creation", () => {
    const state = createInitialAccountsDocument();
    const source = "ФИО;Логин\nПервый Студент;x\nВторой Студент;y";
    const corrected = request(replaceImportRow(source, ";", mapping, true, 2, draft));
    const next = previewStudentImport(state, groups, corrected, date);
    expect(next.errors).toBe(1);
    expect(next.rows[1].status).toBe("error");
    expect(() => applyStudentImport(state, { actorId: "configurator-demo", actorRevision: 1, expectedRevision: 0, request: corrected, batchId: "corrected", fingerprint: "a".repeat(64), expectedGroupRevision: 0, expectedYear: 2026, expectedStudentNumbers: ["202630001"] }, groups, 0, date, [{ id: "new", changeId: "audit" }])).toThrow("есть ошибки");
    expect(state.accounts).toHaveLength(3);
  });
  it("still rejects changing an existing account through an import correction", () => {
    const state = createInitialAccountsDocument();
    const original = structuredClone(state);
    const corrected = replaceImportRow("ФИО;Логин\nДругой Студент;bad", ";", mapping, true, 2, { ...draft, login: "anna.smirnova" });
    expect(previewStudentImport(state, groups, request(corrected), date).rows[0].errors.join()).toContain("Импорт не изменяет существующие учётки");
    expect(state).toEqual(original);
  });
});
