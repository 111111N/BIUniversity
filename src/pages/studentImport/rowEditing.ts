import { mapStudentImportRows, parseImportTable, type ImportDelimiter, type StudentImportField, type StudentImportMapping } from "../../domain/importTable";

export type ImportRowDraft = Record<StudentImportField, string>;

export function replaceImportRow(source: string, delimiter: ImportDelimiter, mapping: StudentImportMapping, hasHeader: boolean, line: number, draft: ImportRowDraft): string {
  const table = parseImportTable(source, delimiter);
  const rows = mapStudentImportRows(table, mapping, hasHeader);
  if (!rows.some((row) => row.line === line)) throw new Error("Строка больше не найдена в списке студентов. Откройте её заново.");
  const record = table.records.find((row) => row.line === line)!;
  const cells = [...record.cells];
  for (const field of Object.keys(mapping) as StudentImportField[]) {
    if (mapping[field] < 0) continue;
    if (typeof draft[field] !== "string" || draft[field].length > 500) throw new Error("Значение в строке должно содержать не более 500 символов.");
    while (cells.length <= mapping[field]) cells.push("");
    cells[mapping[field]] = draft[field];
  }

  // Parser line numbers refer to physical lines, including newlines inside quoted cells.
  const starts = [source.startsWith("\uFEFF") ? 1 : 0];
  const ends: number[] = [];
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    ends.push(match.index);
    starts.push(match.index + match[0].length);
  }
  ends.push(source.length);
  const lastLine = line + record.cells.reduce((count, cell) => count + (cell.match(/\n/g)?.length ?? 0), 0);
  const start = starts[line - 1];
  const end = ends[lastLine - 1];
  const newline = source.slice(start, end).match(/\r\n|\r|\n/)?.[0] ?? source.match(/\r\n|\r|\n/)?.[0] ?? "\n";
  const replacement = cells.map((cell) => {
    const value = cell.replace(/\r\n?/g, "\n").replace(/\n/g, newline);
    return value.includes(table.delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }).join(table.delimiter);
  const corrected = source.slice(0, start) + replacement + source.slice(end);
  const correctedRows = mapStudentImportRows(parseImportTable(corrected, table.delimiter), mapping, hasHeader);
  if (correctedRows.length !== rows.length) throw new Error("Строка не может быть полностью пустой. Укажите данные студента.");
  return corrected;
}
