import { isPortalStorageKey } from "./localBackup";
import { BACKUP_DOCUMENTS, type BackupDocumentKind, type BackupDocumentReview } from "./localBackupDocuments";

export interface BackupRestoreBlocker {
  category: "error" | "unconfirmed" | "unchecked" | "incomplete-review";
  code: string;
  kind?: BackupDocumentKind;
  key?: string;
  referenceId?: string;
  recordId?: string;
  message: string;
}
export interface BackupRestoreAdmission {
  policy: "whole-archive";
  scope: "archived-document-checks";
  status: "blocked" | "requires-final-validation";
  blockers: BackupRestoreBlocker[];
  counts: Record<BackupRestoreBlocker["category"], number>;
  remainingChecks: readonly string[];
}

const REMAINING_CHECKS = Object.freeze([
  "Подтвердить владельцев и полномочия по независимому источнику: читаемая схема и ID не подтверждают право на данные.",
  "Разрешить все конфликты и проверить зависимости итогового набора с сохранением записей только из браузера.",
  "Повторно проверить права и актуальность всех хранилищ перед применением; подготовить пробный прогон и откат.",
]);
const statuses = ["valid", "invalid", "absent"] as const;

/** A document preflight is a necessary condition, never an authorization to write. */
export function assessBackupRestoreAdmission(review: BackupDocumentReview): BackupRestoreAdmission {
  const blockers: BackupRestoreBlocker[] = [];
  let complete = true;
  for (const issue of review.issues) {
    if (!Object.hasOwn(BACKUP_DOCUMENTS, issue.kind) || !["error", "review"].includes(issue.level)) { complete = false; continue; }
    blockers.push({
      category: issue.level === "error" ? "error" : "unconfirmed", code: issue.code, kind: issue.kind,
      message: issue.message, ...(issue.referenceId !== undefined ? { referenceId: issue.referenceId } : {}),
      ...(issue.recordId !== undefined ? { recordId: issue.recordId } : {}),
    });
  }
  // Invalid documents remain blockers even if an older result omitted their matching issue.
  for (const check of review.checks) {
    if (!Object.hasOwn(BACKUP_DOCUMENTS, check.kind) || !statuses.includes(check.status)) { complete = false; continue; }
    if (check.status === "invalid" && !review.issues.some((issue) => issue.kind === check.kind && issue.level === "error" && issue.code === "invalid-document")) {
      blockers.push({ category: "error", code: "invalid-document", kind: check.kind, key: check.key, message: check.message });
    }
  }
  const keys = review.uncheckedKeys ?? [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!isPortalStorageKey(key) || seen.has(key)) { complete = false; continue; }
    seen.add(key);
    blockers.push({ category: "unchecked", code: "unchecked-document", key, message: "Внутренняя схема локального документа не проверена." });
  }
  if (statuses.some((status) => review.counts[status] !== review.checks.filter((check) => check.status === status).length)
    || review.counts.errors !== review.issues.filter((issue) => issue.level === "error").length
    || review.counts.reviews !== review.issues.filter((issue) => issue.level === "review").length
    || review.counts.unchecked !== keys.length) complete = false;
  if (!complete) blockers.push({ category: "incomplete-review", code: "incomplete-review", message: "Результат проверки неполон или устарел. Проверьте исходный архив заново." });
  const counts: BackupRestoreAdmission["counts"] = { error: 0, unconfirmed: 0, unchecked: 0, "incomplete-review": 0 };
  for (const blocker of blockers) counts[blocker.category]++;
  return {
    policy: "whole-archive", scope: "archived-document-checks",
    status: blockers.length ? "blocked" : "requires-final-validation", blockers, counts,
    remainingChecks: REMAINING_CHECKS,
  };
}
