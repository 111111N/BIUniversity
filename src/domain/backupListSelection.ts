import { resolveBackupBaseSelection, type BaseRecordChoice, type BaseSelectionReview } from "./backupBaseSelection";
import { BACKUP_LIST_FAMILIES as FAMILIES } from "./backupListSelectionDefinitions";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import type { BackupRecordEntries } from "./backupRecordComparison";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";

export interface SelectedListSources { planners: BackupRecordEntries; notifications: BackupRecordEntries; journals: BackupRecordEntries; assignments: BackupRecordEntries; submissions: BackupRecordEntries; unavailableJournalKeys: readonly string[] }
interface Result { reviews: BaseSelectionReview[]; sources: SelectedListSources; issues: BackupDocumentIssue[] }

/** Resolve whole saved lists. Unknown envelopes, order and metadata are never synthesized. */
export async function resolveBackupListSelection(archive: BackupRecordEntries, browser: BackupRecordEntries, choices: readonly BaseRecordChoice[], signal?: AbortSignal): Promise<Result> {
  const reviews: BaseSelectionReview[] = [], issues: BackupDocumentIssue[] = [];
  const sources = { planners: [], notifications: [], journals: [], assignments: [], submissions: [], unavailableJournalKeys: [] } as { [K in keyof Omit<SelectedListSources, "unavailableJournalKeys">]: { key: string; raw: string }[] } & { unavailableJournalKeys: string[] };
  const buckets = new Map<string, { archive: { key: string; raw: string }[]; browser: { key: string; raw: string }[] }>();
  const grouped = new Map<string, BaseRecordChoice[]>();
  const inputBudget = createBackupBudget(), outputBudget = createBackupBudget();
  let steps = 0, records = 0;
  const step = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  checkBackupAbort(signal);
  for (const [side, entries] of [["archive", archive], ["browser", browser]] as const) for (const entry of entries) {
    await step(); if (!FAMILIES.some(family => family.definition.matchesKey(entry.key))) continue;
    addBackupText(inputBudget, entry.key); addBackupText(inputBudget, entry.raw);
    const bucket = buckets.get(entry.key) ?? { archive: [], browser: [] };
    bucket[side].push(entry); buckets.set(entry.key, bucket);
    if (buckets.size > BACKUP_LIMITS.records) throw new Error("Источников списков больше 25 000. Частичный результат не создан.");
  }
  if (!Array.isArray(choices) || choices.length > BACKUP_LIMITS.records) throw new Error("Выбор записей списков некорректен или превышает предел проверки.");
  const seen = new Set<string>();
  for (const choice of choices) {
    await step(); let address: unknown;
    try { address = JSON.parse(choice?.key); } catch { address = null; }
    if (!choice || typeof choice.key !== "string" || !["archive", "browser"].includes(choice.version) || seen.has(choice.key) || !Array.isArray(address) || address[1] !== "different" || typeof address[2] !== "string" || typeof address[4] !== "string" || !address[4].trim()) throw new Error("Выбор записей списков содержит неоднозначный адрес. Проверьте файл и выбор заново.");
    const parent = address[0] === "localStorage-record" && address.length === 5;
    const child = address[0] === "localStorage-child-record" && address.length === 6 && typeof address[5] === "string" && Boolean(address[5].trim());
    if (!FAMILIES.some(value => value.definition.matchesKey(address[2]) && ((parent && value.collection === address[3]) || (child && value.children?.collection === address[3])))) throw new Error("Выбор относится к неподдерживаемому списку или области попытки.");
    addBackupText(inputBudget, choice.key); seen.add(choice.key);
    const rows = grouped.get(address[2]) ?? []; rows.push(choice); grouped.set(address[2], rows);
    if (!buckets.has(address[2])) buckets.set(address[2], { archive: [], browser: [] });
  }
  for (const family of FAMILIES) {
    if (family.fallback && !buckets.has(family.fallback)) buckets.set(family.fallback, { archive: [], browser: [] });
  }
  if (buckets.size > BACKUP_LIMITS.records) throw new Error("Источников и адресов выбора списков больше 25 000. Частичный результат не создан.");
  for (const [key, bucket] of buckets) {
    await step(); const family = FAMILIES.find(value => value.definition.matchesKey(key))!;
    let review: BaseSelectionReview;
    if (!family.definition.supportsKey(key)) {
      review = { key, label: family.definition.label, status: "blocked", countsComplete: false,
        counts: { same: 0, archiveOnly: 0, browserOnly: 0, conflicts: 0, unresolved: 0 },
        issues: [{ code: "invalid-source", message: "Ключ списка не поддерживается или неоднозначно задаёт владельца. Другой список не подставлялся." }] };
    } else {
      const result = await resolveBackupBaseSelection(bucket.archive, bucket.browser, grouped.get(key) ?? [], {
        key, prefix: key, exactKey: true, kind: family.kind, label: family.definition.label,
        decode: raw => {
          const document = family.definition.decode(raw, key);
          records += document.rows.length + (document.children?.length ?? 0);
          if (records > BACKUP_LIMITS.records) throw new Error("В списках больше 25 000 записей. Частичный результат не создан.");
          return { revision: 0, ...document };
        },
        collections: [{ collection: family.collection, relativeOrder: family.relativeOrder, read: document => (document as { rows: object[] }).rows }, ...(family.children ? [{
          collection: family.children.collection, parentId: family.children.parentId, project: family.children.project, relativeOrder: true,
          read: (document: object) => (document as { children: object[] }).children,
        }] : [])],
        metadata: document => (document as { envelope: object }).envelope,
      }, signal);
      if (records > BACKUP_LIMITS.records) throw new Error("В списках больше 25 000 записей. Частичный результат не создан.");
      review = result.review;
      if (result.document) {
        const entry = review.source === "archive" ? bucket.archive[0] : bucket.browser[0];
        sources[family.target].push(entry);
      }
    }
    addBackupText(outputBudget, JSON.stringify(review)); reviews.push(review);
    if (family.kind === "journals" && review.status === "blocked") sources.unavailableJournalKeys.push(key);
    for (const finding of review.issues) {
      if (issues.length >= BACKUP_LIMITS.records) throw new Error("Замечаний к спискам больше 25 000. Частичный результат не создан.");
      const item: BackupDocumentIssue = { kind: family.kind, level: "review", code: `selected-list-${finding.code}`, referenceId: key, message: finding.message };
      addBackupText(outputBudget, JSON.stringify(item)); issues.push(item);
    }
  }
  checkBackupAbort(signal);
  return { reviews, sources, issues };
}
