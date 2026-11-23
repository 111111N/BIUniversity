import type { BackupDocumentKind, BackupDocumentReview } from "./localBackupDocuments";
import { inspectBackupDocumentReviewIntegrity } from "./backupDocumentReviewIntegrity";

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
/** A document preflight is a necessary condition, never an authorization to write. */
export function assessBackupRestoreAdmission(review: BackupDocumentReview): BackupRestoreAdmission {
  const blockers: BackupRestoreBlocker[] = [];
  const integrity = inspectBackupDocumentReviewIntegrity(review), invalidIssues = new Set<BackupDocumentKind>();
  for (const issue of integrity.issues) {
    if (issue.level === "error" && issue.code === "invalid-document") invalidIssues.add(issue.kind);
    blockers.push({
      category: issue.level === "error" ? "error" : "unconfirmed", code: issue.code, kind: issue.kind,
      message: issue.message, ...(issue.referenceId !== undefined ? { referenceId: issue.referenceId } : {}),
      ...(issue.recordId !== undefined ? { recordId: issue.recordId } : {}),
    });
  }
  // Invalid documents remain blockers even if an older result omitted their matching issue.
  for (const check of integrity.checks) {
    if (check.status === "invalid" && !invalidIssues.has(check.kind)) {
      blockers.push({ category: "error", code: "invalid-document", kind: check.kind, key: check.key, message: check.message });
    }
  }
  for (const key of integrity.uncheckedKeys) {
    blockers.push({ category: "unchecked", code: "unchecked-document", key, message: "Внутренняя схема локального документа не проверена." });
  }
  if (!integrity.complete) blockers.push({ category: "incomplete-review", code: "incomplete-review", message: "Результат проверки неполон, несовместим или превышает предел проверки. Проверьте исходный архив заново." });
  const counts: BackupRestoreAdmission["counts"] = { error: 0, unconfirmed: 0, unchecked: 0, "incomplete-review": 0 };
  for (const blocker of blockers) counts[blocker.category]++;
  return {
    policy: "whole-archive", scope: "archived-document-checks",
    status: blockers.length ? "blocked" : "requires-final-validation", blockers, counts,
    remainingChecks: REMAINING_CHECKS,
  };
}
