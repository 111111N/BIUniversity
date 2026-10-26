export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_CHARACTERS = 2_000_000;
export type ImportDelimiter = "auto" | "\t" | ";" | ",";
export type StudentImportField = "name" | "login" | "group" | "campus" | "email";
export type StudentImportMapping = Record<StudentImportField, number>;
export interface ImportTableRow { line: number; cells: string[] }
export interface ImportTable { delimiter: Exclude<ImportDelimiter, "auto">; records: ImportTableRow[] }

const detectDelimiter = (text: string): Exclude<ImportDelimiter, "auto"> => {
  const counts = new Map<string, number>([["\t", 0], [";", 0], [",", 0]]);
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') index++; else quoted = !quoted; }
    else if (!quoted && char === "\n") { if ([...counts.values()].some(Boolean)) break; }
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0] as Exclude<ImportDelimiter, "auto">;
};

/** Quoted separators/newlines and doubled quotes follow the same rules for CSV and pasted tables. */
export const parseImportTable = (source: string, separator: ImportDelimiter = "auto"): ImportTable => {
  if (source.length > MAX_IMPORT_CHARACTERS) throw new Error("Список слишком большой. Разделите его на файлы до 2 МБ.");
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = separator === "auto" ? detectDelimiter(text) : separator;
  if (!["\t", ";", ","].includes(delimiter)) throw new Error("Выберите разделитель таблицы.");
  const records: ImportTableRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let recordLine = 1;
  const pushCell = () => { cells.push(cell); cell = ""; closedQuote = false; if (cells.length > 64) throw new Error(`Строка ${recordLine}: допускается не более 64 столбцов.`); };
  const pushRecord = () => {
    pushCell();
    if (cells.some((value) => value.trim())) records.push({ line: recordLine, cells });
    if (records.length > MAX_IMPORT_ROWS + 1) throw new Error(`За один раз можно загрузить до ${MAX_IMPORT_ROWS} студентов.`);
    cells = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closedQuote = true; }
      } else { cell += char; if (char === "\n") line++; }
    } else if (char === delimiter) pushCell();
    else if (char === "\n") { pushRecord(); line++; recordLine = line; }
    else if (char === '"' && !cell && !closedQuote) quoted = true;
    else if (closedQuote) { if (!/\s/.test(char)) throw new Error(`Строка ${recordLine}: после закрывающей кавычки должен быть разделитель.`); }
    else if (char === '"') throw new Error(`Строка ${recordLine}: кавычки внутри значения нужно удвоить и заключить значение в кавычки.`);
    else cell += char;
  }
  if (quoted) throw new Error(`Строка ${recordLine}: не закрыты кавычки.`);
  pushRecord();
  return { delimiter, records };
};

const headerKey = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/[^\p{L}\p{N}]/gu, "");
const aliases: Record<StudentImportField, string[]> = {
  name: ["фио", "фамилияимяотчество", "имяифамилия", "полноеимя", "fullname", "name", "studentname"],
  login: ["логин", "login", "username", "учетнаязапись"],
  group: ["группа", "учебнаягруппа", "group", "groupname"],
  campus: ["корпус", "учебныйкорпус", "campus", "building"],
  email: ["почта", "электроннаяпочта", "email", "emailaddress"],
};
export const suggestStudentImportMapping = (headers: string[]): StudentImportMapping => Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(headerKey(header)))])) as StudentImportMapping;
export const mapStudentImportRows = (table: ImportTable, mapping: StudentImportMapping, hasHeader: boolean) => {
  if (![mapping.name, mapping.login].every((index) => Number.isInteger(index) && index >= 0)) throw new Error("Укажите столбцы с ФИО и логином.");
  const values = (Object.keys(aliases) as StudentImportField[]).map((field) => mapping[field]);
  if (values.some((index) => !Number.isInteger(index) || index < -1)) throw new Error("Для каждого поля выберите отдельный существующий столбец.");
  const indices = values.filter((index) => index >= 0);
  const columnCount = Math.max(0, ...table.records.map((row) => row.cells.length));
  if (indices.some((index) => !Number.isInteger(index) || index >= columnCount) || new Set(indices).size !== indices.length) throw new Error("Для каждого поля выберите отдельный существующий столбец.");
  const rows = table.records.slice(hasHeader ? 1 : 0);
  if (!rows.length) throw new Error("В таблице нет студентов. Добавьте строки после заголовка.");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`За один раз можно загрузить до ${MAX_IMPORT_ROWS} студентов.`);
  return rows.map((row) => ({ line: row.line, ...Object.fromEntries(Object.entries(mapping).map(([field, index]) => [field, index < 0 ? "" : row.cells[index] ?? ""])) })) as Array<{ line: number } & Record<StudentImportField, string>>;
};
