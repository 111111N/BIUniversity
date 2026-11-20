import { ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument, emptyAcademicPeriodsDocument, type AcademicPeriodsDocument } from "./academicPeriods";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import type { BackupRecordEntries } from "./backupRecordComparison";

const COLLECTIONS = ["years", "terms", "history"] as const;
export type PeriodSelectionCollection = typeof COLLECTIONS[number];
export interface PeriodRecordChoice { collection: PeriodSelectionCollection; id: string; version: "archive" | "browser" }
export interface PeriodSelectionReview {
  scope: "academic-period-document"; status: "consistent" | "blocked";
  counts: { same: number; archiveOnly: number; browserOnly: number; conflicts: number; unresolved: number };
  revisions: { archive: number | null; browser: number | null; candidate?: number };
  records?: Record<PeriodSelectionCollection, number>;
  issues: { code: "invalid-source" | "missing-source" | "invalid-choice" | "unresolved-conflicts" | "incompatible-history" | "inconsistent-selection"; message: string }[];
}
type Row = AcademicPeriodsDocument[PeriodSelectionCollection][number];
interface IndexedRow { row: Row; fingerprint: string }
const identity = (collection: PeriodSelectionCollection, id: string) => JSON.stringify([collection, id]);

/** Keep source history positions: period snapshots store the global catalog revision. */
export async function resolveBackupPeriodSelection(archive: BackupRecordEntries, browser: BackupRecordEntries, choices: readonly PeriodRecordChoice[], signal?: AbortSignal): Promise<{ review: PeriodSelectionReview; document?: AcademicPeriodsDocument }> {
  const review: PeriodSelectionReview = { scope: "academic-period-document", status: "blocked", counts: { same: 0, archiveOnly: 0, browserOnly: 0, conflicts: 0, unresolved: 0 }, revisions: { archive: null, browser: null }, issues: [] };
  const reject = (code: PeriodSelectionReview["issues"][number]["code"], message: string) => { review.issues.push({ code, message }); return { review }; };
  const textBudget = createBackupBudget(), valueBudget = createBackupBudget(); let steps = 0;
  const step = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const read = (entries: BackupRecordEntries) => {
    const rows = entries.filter(entry => entry.key.startsWith("bi-university-academic-periods-"));
    if (!rows.length) return null;
    if (rows.length !== 1 || rows[0].key !== ACADEMIC_PERIODS_STORAGE_KEY) throw new Error("Неподдерживаемый или повторяющийся ключ учебных периодов.");
    addBackupText(textBudget, rows[0].key); addBackupText(textBudget, rows[0].raw); return decodeAcademicPeriodsDocument(rows[0].raw);
  };
  checkBackupAbort(signal);
  let left: AcademicPeriodsDocument | null, right: AcademicPeriodsDocument | null;
  try { left = read(archive); right = read(browser); }
  catch { return reject("invalid-source", "Источник учебных периодов повреждён, неоднозначен или превышает предел проверки. Другой источник не подставлялся вместо ошибки."); }
  review.revisions = { archive: left?.revision ?? null, browser: right?.revision ?? null };
  if (!left && !right) return reject("missing-source", "Справочник учебных периодов отсутствует в обоих источниках.");
  if (!Array.isArray(choices) || choices.length > BACKUP_LIMITS.records) return reject("invalid-choice", "Список выбора учебных периодов некорректен или превышает предел проверки.");
  const choiceMap = new Map<string, PeriodRecordChoice>(), used = new Set<string>();
  for (const choice of choices) {
    await step();
    if (!choice || !COLLECTIONS.includes(choice.collection) || typeof choice.id !== "string" || !choice.id || !["archive", "browser"].includes(choice.version) || choiceMap.has(identity(choice.collection, choice.id))) return reject("invalid-choice", "Выбор периодов содержит повтор, неподдерживаемую запись или неверную версию. Проверьте файл заново.");
    choiceMap.set(identity(choice.collection, choice.id), choice);
  }
  const index = async (rows: readonly Row[]) => {
    const result = new Map<string, IndexedRow>();
    for (const row of rows) { await step(); if (++valueBudget.records > BACKUP_LIMITS.records) throw new Error("Проверка учебных периодов превышает предел 25 000 записей. Частичный результат не создан."); result.set(row.id, { row, fingerprint: canonicalBackupValue(await encodeBackupValue(row, valueBudget, signal)) }); }
    return result;
  };
  const candidate = emptyAcademicPeriodsDocument();
  let historySource: AcademicPeriodsDocument | null = null;
  for (const collection of COLLECTIONS) {
    const a = await index(left?.[collection] ?? []), b = await index(right?.[collection] ?? []), selected = new Map<string, IndexedRow>();
    for (const id of new Set([...b.keys(), ...a.keys()])) {
      await step(); const first = a.get(id), second = b.get(id), key = identity(collection, id), choice = choiceMap.get(key);
      if (first && second && first.fingerprint !== second.fingerprint) {
        review.counts.conflicts++;
        if (!choice) { review.counts.unresolved++; continue; }
        used.add(key); selected.set(id, choice.version === "archive" ? first : second);
      } else {
        if (choice) return reject("invalid-choice", "Выбор относится к отсутствующему или уже совпадающему конфликту учебных периодов. Проверьте файл заново.");
        if (!first) review.counts.browserOnly++; else if (!second) review.counts.archiveOnly++; else review.counts.same++;
        selected.set(id, second ?? first!);
      }
    }
    if (collection !== "history") Object.assign(candidate, { [collection]: [...selected.values()].map(entry => entry.row) });
    else if (!review.counts.unresolved) {
      const matches = (source: AcademicPeriodsDocument | null, indexed: Map<string, IndexedRow>) => source && source.history.length === selected.size && source.history.every(event => selected.get(event.id)?.fingerprint === indexed.get(event.id)?.fingerprint);
      historySource = matches(right, b) ? right : matches(left, a) ? left : null;
      if (!historySource) return reject("incompatible-history", "Выбранные события не образуют полную историю одного источника. Перестановка или слияние ветвей меняет глобальные ревизии, на которые ссылаются учебные снимки. Записи только из браузера не отброшены; требуется согласование истории без перенумерации.");
      const positions = new Map(historySource.history.map((event, position) => [event.id, position]));
      for (const [source, indexed] of [[left, a], [right, b]] as const) if (source?.history.some((event, position) => selected.get(event.id)?.fingerprint === indexed.get(event.id)?.fingerprint && positions.get(event.id) !== position)) return reject("incompatible-history", "Общие события имеют разные глобальные позиции в источниках. Нельзя переупорядочить историю без изменения сохранённых ссылок на ревизии; отдельного выбора карточек недостаточно.");
      candidate.history = structuredClone(historySource.history);
    }
  }
  if (review.counts.unresolved) return reject("unresolved-conflicts", "Выберите версии всех различающихся лет, семестров и событий истории после просмотра их значений.");
  if (used.size !== choices.length) return reject("invalid-choice", "Среди выбранных периодов есть неподтверждённый конфликт. Проверьте файл заново.");
  candidate.revision = historySource?.revision ?? 0;
  try { decodeAcademicPeriodsDocument(JSON.stringify(candidate)); }
  catch { return reject("inconsistent-selection", "Карточки лет/семестров не согласованы с выбранной историей: проверьте ревизии, даты, связи и снимки до/после. Автоматических исправлений не выполнялось."); }
  checkBackupAbort(signal);
  review.status = "consistent"; review.revisions.candidate = candidate.revision; review.records = { years: candidate.years.length, terms: candidate.terms.length, history: candidate.history.length };
  return { review, document: candidate };
}
