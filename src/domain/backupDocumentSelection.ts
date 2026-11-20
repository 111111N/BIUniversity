import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import type { BackupRecordEntries } from "./backupRecordComparison";

export interface DocumentRecordChoice { collection: string; id: string; version: "archive" | "browser" }
export interface DocumentSelectionDefinition {
  key: string; prefix: string; label: string; decode(raw: string): object;
  collections: readonly { name: string; recordCollection: string; id?(row: object): string }[];
}
export interface DocumentSelectionReview {
  scope: "local-document-structure"; key: string; label: string; status: "consistent" | "blocked" | "absent";
  counts: { same: number; archiveOnly: number; browserOnly: number; conflicts: number; unresolved: number };
  revisions: { archive: number | null; browser: number | null; candidate?: number }; records?: Record<string, number>;
  issues: { code: "invalid-source" | "invalid-choice" | "unresolved-conflicts" | "incompatible-history" | "inconsistent-selection"; message: string }[];
}
interface State { revision: number; history: object[]; [key: string]: unknown }
interface Entry { row: object; fingerprint: string }
const identity = (collection: string, id: string) => JSON.stringify([collection, id]);

/** Structural preflight only. Do not discard source-only rows or invent a merged audit timeline. */
export async function resolveBackupDocumentSelection(archive: BackupRecordEntries, browser: BackupRecordEntries, choices: readonly DocumentRecordChoice[], definition: DocumentSelectionDefinition, signal?: AbortSignal): Promise<{ review: DocumentSelectionReview; document?: object }> {
  const review: DocumentSelectionReview = { scope: "local-document-structure", key: definition.key, label: definition.label, status: "blocked", counts: { same: 0, archiveOnly: 0, browserOnly: 0, conflicts: 0, unresolved: 0 }, revisions: { archive: null, browser: null }, issues: [] };
  const reject = (code: DocumentSelectionReview["issues"][number]["code"], message: string) => { review.issues.push({ code, message }); return { review }; };
  const textBudget = createBackupBudget(), valueBudget = createBackupBudget(); let steps = 0;
  const step = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const read = (entries: BackupRecordEntries) => {
    const rows = entries.filter(entry => entry.key.startsWith(definition.prefix));
    if (!rows.length) return null;
    if (rows.length !== 1 || rows[0].key !== definition.key) throw new Error("Неподдерживаемый или повторный ключ.");
    addBackupText(textBudget, rows[0].key); addBackupText(textBudget, rows[0].raw); return definition.decode(rows[0].raw) as State;
  };
  checkBackupAbort(signal);
  let left: State | null, right: State | null;
  try { left = read(archive); right = read(browser); }
  catch { return reject("invalid-source", "Источник повреждён, неоднозначен, имеет неподдерживаемую схему или превышает предел проверки. Другой источник не заменяет ошибку."); }
  review.revisions = { archive: left?.revision ?? null, browser: right?.revision ?? null };
  if (!Array.isArray(choices) || choices.length > BACKUP_LIMITS.records) return reject("invalid-choice", "Список выбранных записей некорректен или превышает предел проверки.");
  if (!left && !right) { if (choices.length) return reject("invalid-choice", "Для отсутствующего документа сохранился выбор версии. Проверьте архив заново."); review.status = "absent"; return { review }; }
  const choiceMap = new Map<string, DocumentRecordChoice>(), used = new Set<string>(), supported = new Set(definition.collections.map(collection => collection.recordCollection));
  for (const choice of choices) {
    await step();
    if (!choice || !supported.has(choice.collection) || typeof choice.id !== "string" || !choice.id || !["archive", "browser"].includes(choice.version) || choiceMap.has(identity(choice.collection, choice.id))) return reject("invalid-choice", "Выбор содержит повтор, неподдерживаемый ID или неверную версию. Проверьте архив заново.");
    choiceMap.set(identity(choice.collection, choice.id), choice);
  }
  const index = async (rows: readonly object[], getId?: (row: object) => string) => {
    const result = new Map<string, Entry>();
    for (const row of rows) {
      await step(); if (++valueBudget.records > BACKUP_LIMITS.records) throw new Error("Проверка выбранного документа превышает предел 25 000 записей. Частичный результат не создан.");
      const id = getId ? getId(row) : (row as { id: string }).id;
      if (typeof id !== "string" || !id || result.has(id)) throw new Error("В проверяемом документе неоднозначные ID записей.");
      result.set(id, { row, fingerprint: canonicalBackupValue(await encodeBackupValue(row, valueBudget, signal)) });
    }
    return result;
  };
  const arrays = new Map<string, object[]>(); let historySource: State | null = null;
  for (const collection of definition.collections) {
    const a = await index((left?.[collection.name] ?? []) as object[], collection.id), b = await index((right?.[collection.name] ?? []) as object[], collection.id), selected = new Map<string, Entry>();
    for (const id of new Set([...b.keys(), ...a.keys()])) {
      await step(); const first = a.get(id), second = b.get(id), key = identity(collection.recordCollection, id), choice = choiceMap.get(key);
      if (first && second && first.fingerprint !== second.fingerprint) {
        review.counts.conflicts++;
        if (!choice) { review.counts.unresolved++; continue; }
        used.add(key); selected.set(id, choice.version === "archive" ? first : second);
      } else {
        if (choice) return reject("invalid-choice", "Выбор относится к отсутствующему или уже совпадающему конфликту. Проверьте файл заново.");
        if (!first) review.counts.browserOnly++; else if (!second) review.counts.archiveOnly++; else review.counts.same++;
        selected.set(id, second ?? first!);
      }
    }
    arrays.set(collection.name, [...selected.values()].map(entry => entry.row));
    if (collection.name === "history" && !review.counts.unresolved) {
      const matches = (source: State | null, indexed: Map<string, Entry>) => source && source.history.length === selected.size && source.history.every(event => { const id = (event as { id: string }).id; return selected.get(id)?.fingerprint === indexed.get(id)?.fingerprint; });
      historySource = matches(right, b) ? right : matches(left, a) ? left : null;
      if (!historySource) return reject("incompatible-history", "Выбранные события не образуют полную историю одного источника. Слияние ветвей и перенумерация не выполнялись; записи только из браузера не отброшены.");
      const positions = new Map(historySource.history.map((event, position) => [(event as { id: string }).id, position]));
      for (const [source, indexed] of [[left, a], [right, b]] as const) if (source?.history.some((event, position) => { const id = (event as { id: string }).id; return selected.get(id)?.fingerprint === indexed.get(id)?.fingerprint && positions.get(id) !== position; })) return reject("incompatible-history", "Общие события имеют разные позиции в источниках. Требуется согласование полной истории; порядок не был выбран автоматически.");
    }
  }
  if (review.counts.unresolved) return reject("unresolved-conflicts", "Просмотрите все различающиеся карточки и события этого документа и выберите версии.");
  if (used.size !== choices.length) return reject("invalid-choice", "В выборе остался неподтверждённый конфликт. Проверьте архив заново.");
  if (!historySource) return reject("incompatible-history", "Полная история выбранного документа не подтверждена.");
  const candidate = structuredClone(historySource);
  for (const [collection, rows] of arrays) candidate[collection] = collection === "history" ? structuredClone(historySource.history) : rows;
  try { definition.decode(JSON.stringify(candidate)); }
  catch { return reject("inconsistent-selection", "Карточки, ревизии, связи или снимки до/после не согласованы с выбранной историей. Данные автоматически не исправлялись."); }
  checkBackupAbort(signal); review.status = "consistent"; review.revisions.candidate = candidate.revision; review.records = Object.fromEntries([...arrays].map(([name, rows]) => [name, rows.length]));
  return { review, document: candidate };
}
