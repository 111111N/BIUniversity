import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument } from "./assessmentTypes";
import { decodeAssessmentDocument, emptyAssessmentDocument } from "./assessments";
import { isBackupAssessmentKey } from "./backupAssessmentDocuments";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget, encodeBackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import type { BackupRecordEntries } from "./backupRecordComparison";
import { inspectSelectedAssessmentReferences, type AssessmentReferenceChoice, type AssessmentReferenceReview } from "./backupAssessmentReferences";

const COLLECTIONS = ["assessments", "history", "corrections", "correctionHistory"] as const;
export type AssessmentSelectionCollection = typeof COLLECTIONS[number];
export interface AssessmentRecordChoice { collection: AssessmentSelectionCollection; id: string; version: "archive" | "browser" }
export interface AssessmentSelectionReview {
  scope: "assessment-document";
  status: "consistent" | "blocked";
  counts: { same: number; archiveOnly: number; browserOnly: number; conflicts: number; unresolved: number };
  revisions: { archive: number | null; browser: number | null; candidate?: number };
  records?: Record<AssessmentSelectionCollection, number>;
  issues: { code: "invalid-source" | "invalid-choice" | "unresolved-conflicts" | "inconsistent-selection" | "unresolved-references"; message: string }[];
  references?: AssessmentReferenceReview;
}
type Row = AssessmentDocument[AssessmentSelectionCollection][number];
interface IndexedRow { row: Row; fingerprint: string }
const identity = (collection: AssessmentSelectionCollection, id: string) => JSON.stringify([collection, id]);

/** Preserve equal-time order within the same assessment/attempt, without coupling independent records. */
const orderRows = (selected: Map<string, IndexedRow>, sources: readonly Map<string, IndexedRow>[], timeField: "occurredAt" | "openedAt", scope: (row: Row) => string) => {
  const time = ({ row }: IndexedRow) => Date.parse((row as unknown as Record<string, string>)[timeField]);
  const edges = new Map<string, Set<string>>(), incoming = new Map<string, number>();
  for (const id of selected.keys()) { edges.set(id, new Set()); incoming.set(id, 0); }
  for (const source of sources) {
    const preceding = new Map<string, IndexedRow>();
    for (const [id, entry] of source) {
      if (selected.get(id)?.fingerprint !== entry.fingerprint) continue;
      const key = scope(entry.row), previous = preceding.get(key);
      if (previous && time(previous) === time(entry) && !edges.get(previous.row.id)!.has(id)) {
        edges.get(previous.row.id)!.add(id); incoming.set(id, incoming.get(id)! + 1);
      }
      preceding.set(key, entry);
    }
  }
  const buckets = new Map<number, string[]>();
  for (const [id, entry] of selected) { const key = time(entry); const bucket = buckets.get(key) ?? []; bucket.push(id); buckets.set(key, bucket); }
  const result: Row[] = [];
  for (const [, ids] of [...buckets].sort(([a], [b]) => a - b)) {
    const ready = ids.filter(id => incoming.get(id) === 0);
    let emitted = 0;
    for (let index = 0; index < ready.length; index++) {
      const id = ready[index]; result.push(selected.get(id)!.row); emitted++;
      for (const next of edges.get(id)!) {
        incoming.set(next, incoming.get(next)! - 1);
        if (incoming.get(next) === 0) ready.push(next);
      }
    }
    if (emitted !== ids.length) return null;
  }
  return result;
};

/** Pure preflight: no candidate data or permission to restore leaves this function. */
export async function reviewBackupAssessmentSelection(
  archive: BackupRecordEntries, browser: BackupRecordEntries, choices: readonly AssessmentRecordChoice[], signal?: AbortSignal,
  referenceCheck?: { choices: readonly AssessmentReferenceChoice[] },
): Promise<AssessmentSelectionReview> {
  checkBackupAbort(signal);
  const result: AssessmentSelectionReview = { scope: "assessment-document", status: "blocked", counts: { same: 0, archiveOnly: 0, browserOnly: 0, conflicts: 0, unresolved: 0 }, revisions: { archive: null, browser: null }, issues: [] };
  const reject = (code: AssessmentSelectionReview["issues"][number]["code"], message: string) => { result.issues.push({ code, message }); return result; };
  const read = (entries: BackupRecordEntries) => {
    const matches = entries.filter(entry => isBackupAssessmentKey(entry.key));
    const budget = createBackupBudget();
    for (const entry of matches) { addBackupText(budget, entry.key); addBackupText(budget, entry.raw); }
    if (!matches.length) return null;
    if (matches.length !== 1 || matches[0].key !== ASSESSMENTS_STORAGE_KEY) throw new Error("Unsupported assessment source");
    return decodeAssessmentDocument(matches[0].raw);
  };
  let a: AssessmentDocument | null, b: AssessmentDocument | null;
  try { a = read(archive); b = read(browser); }
  catch { return reject("invalid-source", "Один из документов аттестаций не читается или содержит неподдерживаемый ключ. Проверьте исходные данные; повреждённый документ не считается пустым."); }
  result.revisions = { archive: a?.revision ?? null, browser: b?.revision ?? null };
  const budget = createBackupBudget(); let steps = 0;
  const checkpoint = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  const index = async (rows: readonly Row[]) => {
    const indexed = new Map<string, IndexedRow>();
    for (const row of rows) {
      await checkpoint();
      if (++budget.records > BACKUP_LIMITS.records) throw new Error("Для проверки выбранного набора превышен предел 25 000 записей. Частичный результат не создан.");
      indexed.set(row.id, { row, fingerprint: canonicalBackupValue(await encodeBackupValue(row, budget, signal)) });
    }
    return indexed;
  };
  const choiceMap = new Map<string, AssessmentRecordChoice>();
  for (const choice of choices) {
    await checkpoint(); const key = identity(choice.collection, choice.id);
    if (!COLLECTIONS.includes(choice.collection) || !["archive", "browser"].includes(choice.version) || choiceMap.has(key)) return reject("invalid-choice", "Выбор версий неполон или устарел. Просмотрите различия и выберите версии заново.");
    choiceMap.set(key, choice);
  }
  const candidate = emptyAssessmentDocument();
  const usedChoices = new Set<string>();
  for (const collection of COLLECTIONS) {
    const left = await index(a?.[collection] ?? []), right = await index(b?.[collection] ?? []), selected = new Map<string, IndexedRow>();
    for (const id of new Set([...right.keys(), ...left.keys()])) {
      await checkpoint();
      const first = left.get(id), second = right.get(id), key = identity(collection, id), choice = choiceMap.get(key);
      if (first && second && first.fingerprint !== second.fingerprint) {
        result.counts.conflicts++;
        if (!choice) { result.counts.unresolved++; continue; }
        usedChoices.add(key); selected.set(id, choice.version === "archive" ? first : second);
      } else {
        if (!first) result.counts.browserOnly++;
        else if (!second) result.counts.archiveOnly++;
        else result.counts.same++;
        selected.set(id, second ?? first!);
      }
    }
    const correctionAttempts = new Map(candidate.corrections.map(row => [row.id, row.attemptId]));
    const scope = (row: Row) => "correctionId" in row ? correctionAttempts.get(row.correctionId) ?? row.correctionId
      : collection === "corrections" && "attemptId" in row ? row.attemptId : "assessmentId" in row ? row.assessmentId : row.id;
    const ordered = collection === "assessments" ? [...selected.values()].map(entry => entry.row)
      : orderRows(selected, [right, left], collection === "corrections" ? "openedAt" : "occurredAt", scope);
    if (!ordered) return reject("inconsistent-selection", "Выбранные версии противоречат порядку истории. Согласуйте выбор связанных карточек и событий; порядок не был угадан.");
    Object.assign(candidate, { [collection]: ordered });
  }
  checkBackupAbort(signal);
  if (usedChoices.size !== choices.length) return reject("invalid-choice", "Выбор относится к отсутствующему или уже совпадающему конфликту. Проверьте файл заново.");
  if (result.counts.unresolved) return reject("unresolved-conflicts", "Выберите версию каждого различающегося ID аттестации, её истории и исправлений после просмотра значений.");
  candidate.revision = candidate.history.length + candidate.correctionHistory.length;
  if (candidate.assessments.some(row => Object.hasOwn(row, "academicPeriod")) || candidate.history.some(row => Object.hasOwn(row, "academicPeriod"))) candidate.version = 6;
  try { decodeAssessmentDocument(JSON.stringify(candidate)); }
  catch { return reject("inconsistent-selection", "Выбранная карточка, состав, попытки, результаты или исправления не согласованы с историей. Согласуйте версии связанных записей. Оценки, события и назначения автоматически не исправлялись."); }
  checkBackupAbort(signal);
  result.revisions.candidate = candidate.revision;
  result.records = { assessments: candidate.assessments.length, history: candidate.history.length, corrections: candidate.corrections.length, correctionHistory: candidate.correctionHistory.length };
  if (referenceCheck) {
    result.references = await inspectSelectedAssessmentReferences(candidate, archive, browser, referenceCheck.choices, signal);
    if (result.references.status === "blocked") return reject("unresolved-references", "Наличие всех ссылок в выбранных справочниках пока не подтверждено. Проверьте замечания к учёткам, группам, дисциплинам и учебным периодам.");
  }
  result.status = "consistent";
  return result;
}
