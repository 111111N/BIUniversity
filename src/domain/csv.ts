export type CsvCell = string | number | null | undefined;

/** Spreadsheet formula protection applies to text; real numeric cells stay numeric. */
const escapeCsvCell = (value: CsvCell) => {
  const text = value == null ? "" : String(value);
  const safe = typeof value === "string" && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export const createCsv = (rows: CsvCell[][]) => `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(";")).join("\r\n")}`;
