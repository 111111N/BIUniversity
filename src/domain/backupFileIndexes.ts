import { checkBackupAbort, type AdministrativeBackup, type BackupStoreMetadata, type BackupValue } from "./localBackup";

type RecordEntry = AdministrativeBackup["databases"][number]["stores"][number]["records"][number];
export interface FileIndexIssue { level: "error"; code: "file-unique-index-conflict" | "invalid-file-index-schema"; message: string; recordId: string }
const number = (value: number): BackupValue => ({ type: "number", value });
const string = (value: string): BackupValue => ({ type: "string", value });

// Read stored own fields and the type-specific properties defined by IndexedDB, never a JS prototype.
const property = (node: BackupValue | undefined, key: string): BackupValue | undefined => {
  if (node?.type === "object") return node.entries.find(([name]) => name === key)?.[1];
  if (key === "length") {
    if (node?.type === "array") return number(node.value.length);
    if (node?.type === "string") return number(node.value.length);
  }
  if (node?.type === "blob") {
    if (key === "size") return number(node.size);
    if (key === "type") return string(node.mediaType);
    if (node.file && key === "name") return string(node.file.name);
    if (node.file && key === "lastModified") return number(node.file.lastModified);
  }
  return undefined;
};
// The strict end assertion rejects trailing line terminators as well as other non-identifier characters.
const literalPath = (path: string) => path === "" || /^[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*(?:\.[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*)*(?![\s\S])/u.test(path);
const identifierStart = /^[$_\p{ID_Start}]$/u;
const identifierPart = /^[$_\u200C\u200D\p{ID_Continue}]$/u;
const supportedPath = async (path: string, step: () => Promise<void>) => {
  if (literalPath(path)) return true;
  if (!path.includes("\\")) return false;
  const escape = /\\u(?:\{([\da-fA-F]+)\}|([\da-fA-F]{4}))/y;
  for (const part of path.split(".")) {
    if (!part) return false;
    let offset = 0;
    while (offset < part.length) {
      await step();
      const first = offset === 0;
      let code = part.codePointAt(offset)!;
      if (part[offset] === "\\") {
        escape.lastIndex = offset;
        const match = escape.exec(part);
        if (!match) return false;
        code = Number.parseInt(match[1] ?? match[2], 16);
        if (code > 0x10FFFF) return false;
        offset += match[0].length;
      } else offset += code > 0xFFFF ? 2 : 1;
      if (!(first ? identifierStart : identifierPart).test(String.fromCodePoint(code))) return false;
    }
  }
  // IndexedDB splits the stored path and reads own properties by their literal spelling.
  // Escape syntax is validated above, but is not decoded into a different property name.
  // https://w3c.github.io/IndexedDB/#evaluate-a-key-path-on-a-value
  return true;
};
type IndexKey = ["string", string] | ["number" | "date", number] | ["array", IndexKey[]];
const arrayKey = (children: IndexKey[]): IndexKey => ["array", children];

/** Compare current index keys in the archive, without creating indexes or promising future writes. */
export const inspectArchivedFileIndexes = async (records: readonly RecordEntry[], indexes: readonly BackupStoreMetadata["indexes"][number][], signal?: AbortSignal) => {
  const issues: FileIndexIssue[] = []; const unique = indexes.filter((index) => index.unique);
  let checked = 0; let unchecked = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const key = async (node: BackupValue | undefined): Promise<IndexKey | undefined> => {
    await step();
    if (node?.type === "string") return ["string", node.value];
    if (node?.type === "number" && Number.isFinite(node.value)) return ["number", node.value];
    if (node?.type === "date" && Number.isFinite(Date.parse(node.value))) return ["date", Date.parse(node.value)];
    if (node?.type === "array") {
      const children: IndexKey[] = [];
      for (const child of node.value) { const token = await key(child); if (token === undefined) return undefined; children.push(token); }
      return arrayKey(children);
    }
    return undefined;
  };
  checkBackupAbort(signal);
  for (const index of unique) {
    await step();
    if (Array.isArray(index.keyPath) && (index.multiEntry || !index.keyPath.length)) {
      unchecked++;
      issues.push({ level: "error", code: "invalid-file-index-schema", recordId: JSON.stringify(["index", index.name]),
        message: "Схема дополнительного уникального индекса недопустима: составной путь не может быть пустым или сочетаться с multiEntry. Индекс не создавался, схема не исправлялась.",
      }); continue;
    }
    const sourcePaths = typeof index.keyPath === "string" ? [index.keyPath] : index.keyPath;
    let supported = true;
    for (const path of sourcePaths) { if (!await supportedPath(path, step)) { supported = false; break; } }
    if (!supported) { unchecked++; continue; }
    const paths = sourcePaths.map((path) => path === "" ? [] : path.split("."));
    const seen = new Map<string, string>();
    for (const [position, record] of records.entries()) {
      await step(); const values: (BackupValue | undefined)[] = [];
      for (const path of paths) {
        let value: BackupValue | undefined = record.value;
        for (const part of path) { await step(); value = property(value, part); if (value === undefined) break; }
        values.push(value);
      }
      const tokens = new Set<string>();
      if (Array.isArray(index.keyPath)) {
        const children: IndexKey[] = [];
        for (const value of values) { const token = await key(value); if (token === undefined) break; children.push(token); }
        if (children.length === paths.length) tokens.add(JSON.stringify(arrayKey(children)));
      } else if (index.multiEntry && values[0]?.type === "array") {
        // Only the outer array expands. Invalid members are skipped; repeated members belong to one record.
        for (const child of values[0].value) { const token = await key(child); if (token !== undefined) tokens.add(JSON.stringify(token)); }
      } else { const token = await key(values[0]); if (token !== undefined) tokens.add(JSON.stringify(token)); }
      const recordId = record.key.type === "string" ? record.key.value : `row:${position + 1}`;
      let conflict: string | undefined;
      for (const token of tokens) {
        await step(); const previous = seen.get(token);
        if (previous !== undefined) conflict ??= previous;
        else seen.set(token, recordId);
      }
      if (conflict !== undefined) issues.push({ level: "error", code: "file-unique-index-conflict",
        recordId: JSON.stringify(["index", index.name, conflict, recordId]),
        message: "В сохранённых файловых записях повторяется ключ дополнительного уникального индекса. Такой набор несовместим с его ограничением. Значения индекса, имена и содержимое файлов не включены в отчёт; записи не объединялись и не удалялись.",
      });
    }
    checked++;
  }
  checkBackupAbort(signal);
  return { issues, summary: unique.length ? `Дополнительных уникальных индексов: ${unique.length}; сверены текущие ключи: ${checked}; требуют отдельной сверки: ${unchecked}; конфликтующих записей: ${issues.filter((issue) => issue.code === "file-unique-index-conflict").length}. Проверены строковые и составные пути с буквальными Unicode-идентификаторами и допустимыми Unicode-escape, ключи-массивы и multiEntry. Повторы внутри одного multiEntry-набора не считаются разными записями; каждая конфликтующая запись учитывается один раз на индекс. Имена полей не нормализуются и не декодируются: escape-запись сопоставляется с буквальным именем свойства. Недопустимые или неподдержанные пути и схемы требуют отдельной сверки. Отсутствие текущих коллизий не подтверждает совместимость будущих записей или восстановления.` : "" };
};
