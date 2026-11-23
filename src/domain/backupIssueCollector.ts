import { addBackupText, BACKUP_LIMITS, createBackupBudget } from "./localBackup";
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
