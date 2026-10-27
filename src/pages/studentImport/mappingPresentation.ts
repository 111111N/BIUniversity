import { mapStudentImportRows, type ImportTable, type StudentImportField, type StudentImportMapping } from "../../domain/importTable";

export const IMPORT_FIELDS: Array<{ value: StudentImportField; label: string; required?: boolean }> = [{ value: "name", label: "ФИО", required: true }, { value: "login", label: "Логин", required: true }, { value: "group", label: "Группа" }, { value: "campus", label: "Корпус" }, { value: "email", label: "Электронная почта" }];
export const getImportColumns = (table: ImportTable, hasHeader: boolean) => Array.from({ length: Math.max(0, ...table.records.map((row) => row.cells.length)) }, (_, index) => ({ value: String(index), label: `${index + 1}. ${hasHeader ? (table.records[0]?.cells[index] || `Столбец ${index + 1}`).slice(0, 60) : `Столбец ${index + 1}`}` }));
export const getImportColumnExamples = (table: ImportTable, index: number, hasHeader: boolean) => index < 0 ? [] : table.records.slice(hasHeader ? 1 : 0).slice(0, 2).map((row) => ({ line: row.line, value: row.cells[index] ?? "" }));
export const getImportMappingState = (table: ImportTable | null, mapping: StudentImportMapping, hasHeader: boolean) => {
  if (!table) return { count: 0, error: "Добавьте корректную таблицу студентов." };
  try { return { count: mapStudentImportRows(table, mapping, hasHeader).length, error: "" }; }
  catch (error) { return { count: 0, error: error instanceof Error ? error.message : "Проверьте выбранные столбцы." }; }
};
