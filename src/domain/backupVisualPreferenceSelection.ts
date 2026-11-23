import type { BaseRecordChoice, BaseSelectionReview } from "./backupBaseSelection";
import type { BackupRecordEntries } from "./backupRecordComparison";
import { BACKUP_VISUAL_PREFERENCE_KEYS, getBackupVisualPreferenceLabel, isBackupVisualPreferenceKey, isSupportedBackupVisualPreferenceValue } from "./backupVisualPreferences";
import { isBackupSettingKey } from "./backupSettingsDocuments";
import { getBackupDifferenceKey } from "./backupComparison";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import { createBackupIssueCollector } from "./backupIssueCollector";

/** Choose exact saved scalar values. Account selection and unsupported key families stay blocked. */
export async function resolveBackupVisualPreferenceSelection(archive: BackupRecordEntries, browser: BackupRecordEntries, choices: readonly BaseRecordChoice[], signal?: AbortSignal) {
  const reviews: BaseSelectionReview[] = [], entries: { key: string; raw: string }[] = [];
  const { issues, add } = createBackupIssueCollector("выбранным настройкам");
  const inputBudget = createBackupBudget(), outputBudget = createBackupBudget();
  const buckets = new Map<string, { archive: { key: string; raw: string }[]; browser: { key: string; raw: string }[] }>();
  const selected = new Map<string, BaseRecordChoice["version"]>();
  let steps = 0;
  const step = async () => { if (++steps % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  checkBackupAbort(signal);
  if (archive.length > BACKUP_LIMITS.records || browser.length > BACKUP_LIMITS.records) throw new Error("Источник настроек превышает 25 000 локальных записей. Частичный результат не создан.");
  for (const [side, rows] of [["archive", archive], ["browser", browser]] as const) for (const entry of rows) {
    await step(); if (!isBackupSettingKey(entry.key)) continue;
    if (++inputBudget.records > BACKUP_LIMITS.records) throw new Error("Записей настроек больше 25 000. Частичный результат не создан.");
    addBackupText(inputBudget, entry.key); addBackupText(inputBudget, entry.raw);
    const bucket = buckets.get(entry.key) ?? { archive: [], browser: [] };
    bucket[side].push(entry); buckets.set(entry.key, bucket);
    if (buckets.size > BACKUP_LIMITS.records) throw new Error("Настроек больше 25 000. Частичный результат не создан.");
  }
  if (!Array.isArray(choices) || choices.length > BACKUP_LIMITS.records) throw new Error("Список выбора настроек некорректен или превышает предел проверки.");
  for (const choice of choices) {
    await step(); let address: unknown;
    try { address = JSON.parse(choice?.key); } catch { address = null; }
    if (!choice || typeof choice.key !== "string" || !["archive", "browser"].includes(choice.version) || !Array.isArray(address) || address.length !== 3 || address[0] !== "localStorage" || address[1] !== "different" || typeof address[2] !== "string" || !isBackupVisualPreferenceKey(address[2]) || selected.has(address[2])) throw new Error("Выбор настройки имеет неподдерживаемый или повторный адрес. Проверьте файл и выбор заново.");
    if (getBackupDifferenceKey({ kind: "different", area: "", id: address[2], reference: { storage: "localStorage", key: address[2] } }) !== choice.key) throw new Error("Адрес выбора настройки не соответствует просмотренному конфликту.");
    addBackupText(inputBudget, choice.key); selected.set(address[2], choice.version);
    if (!buckets.has(address[2])) buckets.set(address[2], { archive: [], browser: [] });
  }
  for (const key of [BACKUP_VISUAL_PREFERENCE_KEYS.theme, BACKUP_VISUAL_PREFERENCE_KEYS.plannerView]) if (!buckets.has(key)) buckets.set(key, { archive: [], browser: [] });
  if (buckets.size > BACKUP_LIMITS.records) throw new Error("Источников и адресов выбора настроек больше 25 000. Частичный результат не создан.");
  for (const [key, bucket] of buckets) {
    await step();
    const review: BaseSelectionReview = { key, label: getBackupVisualPreferenceLabel(key) ?? "Настройка вне поддерживаемого выбора", status: "blocked", countsComplete: false, counts: { same: 0, archiveOnly: 0, browserOnly: 0, conflicts: 0, unresolved: 0 }, issues: [] };
    const reject = (code: BaseSelectionReview["issues"][number]["code"], message: string) => { review.issues.push({ code, message }); };
    const a = bucket.archive[0], b = bucket.browser[0], choice = selected.get(key);
    if (bucket.archive.length > 1 || bucket.browser.length > 1) reject("invalid-source", "В одном источнике повторяется ключ настройки. Версия не выбиралась и другой источник не подставлялся.");
    else if (!isBackupVisualPreferenceKey(key)) reject("invalid-source", "Ключ относится к выбору учётки/роли или неподдерживаемому формату настройки. Правила восстановления входа и переноса этого ключа не определены; значение не выбиралось.");
    else if ((a && !isSupportedBackupVisualPreferenceValue(key, a.raw)) || (b && !isSupportedBackupVisualPreferenceValue(key, b.raw))) reject("invalid-source", "Одно из значений не входит в поддерживаемый набор. Исходные значения не показаны и не заменены значением по умолчанию.");
    else if (choice && (!a || !b || a.raw === b.raw)) reject("invalid-choice", "Выбор относится к отсутствующему или совпадающему конфликту настройки. Проверьте файл заново.");
    else if (!a && !b) { review.status = "absent"; review.countsComplete = true; }
    else {
      review.countsComplete = true;
      if (a && b && a.raw !== b.raw) {
        review.counts.conflicts = 1;
        if (!choice) { review.counts.unresolved = 1; reject("unresolved-conflicts", "Просмотрите обе версии настройки и выберите одну. Приоритет источника не назначен."); }
      } else if (!a) review.counts.browserOnly = 1;
      else if (!b) review.counts.archiveOnly = 1;
      else review.counts.same = 1;
      if (!review.issues.length) {
        review.status = "matched"; review.source = a && b && a.raw === b.raw ? "both" : choice ?? (b ? "browser" : "archive");
        const entry = review.source === "archive" ? a! : b!;
        entries.push({ ...entry });
      }
    }
    addBackupText(outputBudget, JSON.stringify(review)); reviews.push(review);
    for (const finding of review.issues) add({ kind: "settings", level: "review", code: `selected-setting-${finding.code}`, referenceId: key, message: finding.message });
  }
  checkBackupAbort(signal);
  return { reviews, entries, issues };
}
