import { addBackupText, BACKUP_LIMITS, createBackupBudget, isPortalStorageKey } from "./localBackup";
import { BACKUP_DOCUMENTS, type BackupDocumentCheck, type BackupDocumentIssue, type BackupDocumentReview } from "./localBackupDocuments";

export interface BackupDocumentReviewIntegrity {
  complete: boolean;
  checks: readonly BackupDocumentCheck[];
  issues: readonly BackupDocumentIssue[];
  uncheckedKeys: readonly string[];
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length * 2 <= BACKUP_LIMITS.textBytes && Boolean(value.trim());
const fields = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const own = (value: Record<string, unknown>, required: readonly string[]) => required.every(key => Object.hasOwn(value, key));
const COUNT_FIELDS = ["valid", "invalid", "absent", "unchecked", "errors", "reviews"] as const;
const CHECK_FIELDS = ["kind", "key", "label", "status", "message", "revision", "records", "documents", "keys"];
const ISSUE_FIELDS = ["kind", "level", "code", "message", "referenceId", "recordId"];

/** Validate the complete current review contract without repairing counters or missing sections. */
export function inspectBackupDocumentReviewIntegrity(value: unknown): BackupDocumentReviewIntegrity {
  const empty = (): BackupDocumentReviewIntegrity => ({ complete: false, checks: [], issues: [], uncheckedKeys: [] });
  try {
    if (!object(value) || !fields(value, ["checks", "issues", "uncheckedKeys", "counts"]) || !own(value, ["checks", "issues", "counts"]) || !Array.isArray(value.checks) || !Array.isArray(value.issues)
      || (value.uncheckedKeys !== undefined && !Array.isArray(value.uncheckedKeys)) || !object(value.counts)) return empty();
    const reportedCounts = value.counts;
    const countersValid = fields(reportedCounts, COUNT_FIELDS) && own(reportedCounts, COUNT_FIELDS) && COUNT_FIELDS.every(key => number(reportedCounts[key]));
    const keys: unknown[] = value.uncheckedKeys ?? [];
    if ([value.checks.length, value.issues.length, keys.length].some(length => length > BACKUP_LIMITS.records)) return empty();
    const checks: BackupDocumentCheck[] = [], issues: BackupDocumentIssue[] = [], uncheckedKeys: string[] = [];
    const kinds = new Set<string>(), issueAddresses = new Set<string>(), seenKeys = new Set<string>();
    const checkBudget = createBackupBudget(), issueBudget = createBackupBudget(), keyBudget = createBackupBudget();
    const counts: BackupDocumentReview["counts"] = { valid: 0, invalid: 0, absent: 0, unchecked: 0, errors: 0, reviews: 0 };
    let complete = countersValid;
    for (const row of value.checks) {
      if (!object(row) || !fields(row, CHECK_FIELDS) || !own(row, ["kind", "key", "label", "status", "message"]) || !text(row.kind) || !Object.hasOwn(BACKUP_DOCUMENTS, row.kind)
        || !text(row.key) || !text(row.label) || !text(row.message) || !["valid", "invalid", "absent"].includes(row.status as string)
        || ["revision", "records", "documents", "keys"].some(key => row[key] !== undefined && !number(row[key]))) { complete = false; continue; }
      const check = row as unknown as BackupDocumentCheck;
      addBackupText(checkBudget, JSON.stringify(check));
      if (kinds.has(check.kind) || check.key !== BACKUP_DOCUMENTS[check.kind].key) complete = false;
      if (check.status === "absent" && (check.revision !== undefined || [check.records, check.documents, check.keys].some(count => count !== undefined && count !== 0))) complete = false;
      kinds.add(check.kind); counts[check.status]++; checks.push(check);
    }
    if (kinds.size !== Object.keys(BACKUP_DOCUMENTS).length) complete = false;
    for (const row of value.issues) {
      if (!object(row) || !fields(row, ISSUE_FIELDS) || !own(row, ["kind", "level", "code", "message"]) || !text(row.kind) || !Object.hasOwn(BACKUP_DOCUMENTS, row.kind)
        || !["error", "review"].includes(row.level as string) || !text(row.code) || !text(row.message)
        || ["referenceId", "recordId"].some(key => row[key] !== undefined && (typeof row[key] !== "string" || row[key].length * 2 > BACKUP_LIMITS.textBytes))) { complete = false; continue; }
      const issue = row as unknown as BackupDocumentIssue;
      addBackupText(issueBudget, JSON.stringify(issue));
      const address = JSON.stringify([issue.kind, issue.code, issue.referenceId ?? "", issue.recordId ?? ""]);
      if (issueAddresses.has(address)) complete = false;
      issueAddresses.add(address); counts[issue.level === "error" ? "errors" : "reviews"]++; issues.push(issue);
    }
    for (const key of keys) {
      if (!text(key) || !isPortalStorageKey(key) || seenKeys.has(key)) { complete = false; continue; }
      addBackupText(keyBudget, key); seenKeys.add(key); uncheckedKeys.push(key); counts.unchecked++;
    }
    if (COUNT_FIELDS.some(key => reportedCounts[key] !== counts[key])) complete = false;
    return { complete, checks, issues, uncheckedKeys };
  } catch (error) {
    console.error("Не удалось проверить полноту результата проверки документов архива:", error);
    return empty();
  }
}

export function assertCompleteBackupDocumentReview(review: unknown): asserts review is BackupDocumentReview {
  if (!inspectBackupDocumentReviewIntegrity(review).complete) throw new Error("Результат проверки документов неполон, несовместим или превышает предел проверки. Проверьте исходный архив заново; неполный отчёт не скачан.");
}
