import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

/** Keep complete bounded findings; callers propagate limit errors instead of returning partial success. */
export function createBackupFindingCollector<T extends object>(scope: string, address: (finding: T) => string) {
  const issues: T[] = [], seen = new Set<string>(), budget = createBackupBudget();
  const add = (finding: T) => {
    const key = address(finding);
    if (seen.has(key)) return;
    if (issues.length >= BACKUP_LIMITS.records) throw new Error(`Замечаний к ${scope} больше 25 000. Частичный результат не создан.`);
    const text = JSON.stringify(finding);
    if (budget.textBytes + text.length * 2 > BACKUP_LIMITS.textBytes) throw new Error(`Текст замечаний к ${scope} превышает 16 МиБ. Частичный результат не создан.`);
    addBackupText(budget, text); seen.add(key); issues.push(finding);
  };
  return { issues, add };
}

export function createBackupIssueCollector(scope: string) {
  return createBackupFindingCollector<BackupDocumentIssue>(scope, finding => JSON.stringify([finding.kind, finding.code, finding.referenceId, finding.recordId]));
}

/** Bound traversal/index work independently of the bounded finding collector. */
export function createBackupInspectionWork(scope: string, signal?: AbortSignal) {
  const budget = createBackupBudget();
  let operations = 0;
  const assertRecords = (count: number) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > BACKUP_LIMITS.records) throw new Error(`Записей для ${scope} больше 25 000 или их число некорректно. Частичный результат не создан.`);
  };
  const check = (count = 1) => {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Некорректный объём операций для ${scope}. Частичный результат не создан.`);
    const before = operations; operations += count;
    if (operations > BACKUP_LIMITS.nodes) throw new Error(`Операций для ${scope} больше 500 000. Частичный результат не создан.`);
    checkBackupAbort(signal);
    return Math.floor(before / 128) !== Math.floor(operations / 128);
  };
  const step = async (count = 1) => {
    if (check(count)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  return { assertRecords, step, check, addText: (value: string) => addBackupText(budget, value) };
}
