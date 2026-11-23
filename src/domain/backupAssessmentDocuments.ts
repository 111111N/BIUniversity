import { ASSESSMENTS_STORAGE_KEY, type AssessmentDocument } from "./assessmentTypes";
import { decodeAssessmentDocument } from "./assessments";
import { checkBackupAbort, type AdministrativeBackup } from "./localBackup";
import type { BackupDocumentCheck, BackupDocumentIssue } from "./localBackupDocuments";
import { inspectAssessmentDependencies, type AssessmentDependencySources } from "./backupAssessmentDependencies";
import type { AccountsDocument } from "./accounts";
import type { SubjectCatalogDocument } from "./subjectCatalog";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { inspectArchivedSubjectStates } from "./backupSubjectStates";

export const BACKUP_ASSESSMENT_DOCUMENTS = {
  assessments: { key: ASSESSMENTS_STORAGE_KEY, prefix: "bi-university-assessments-", label: "Аттестации и ведомости" },
} as const;
export const isBackupAssessmentKey = (key: string): boolean => key.startsWith(BACKUP_ASSESSMENT_DOCUMENTS.assessments.prefix);
export interface BackupAssessmentSources extends AssessmentDependencySources {
  accounts?: AccountsDocument;
  subjects?: SubjectCatalogDocument;
  schedule?: ManagedScheduleSnapshot;
}

/** Check archived IDs, never today's role, membership or name as proof of historical access. */
export async function inspectBackupAssessments(
  entries: AdministrativeBackup["localStorage"], sources: BackupAssessmentSources, completedAt: string, signal?: AbortSignal,
): Promise<{ checks: BackupDocumentCheck[]; issues: BackupDocumentIssue[]; subjectStateSummary: string }> {
  checkBackupAbort(signal);
  const definition = BACKUP_ASSESSMENT_DOCUMENTS.assessments;
  const issues: BackupDocumentIssue[] = [];
  const seen = new Set<string>();
  const issue = (value: Omit<BackupDocumentIssue, "kind">) => {
    const key = JSON.stringify([value.code, value.referenceId, value.recordId]);
    if (!seen.has(key)) { seen.add(key); issues.push({ kind: "assessments", ...value }); }
  };
  let count = 0;
  const step = async () => {
    if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  let documents = 0; let invalid = 0; let currentKeys = 0; let document: AssessmentDocument | undefined;
  for (const entry of entries) {
    await step();
    if (!isBackupAssessmentKey(entry.key)) continue;
    documents++;
    if (entry.key !== definition.key || ++currentKeys > 1) {
      invalid++;
      issue({ level: "error", code: "unsupported-assessment-key", referenceId: entry.key,
        message: "Неподдерживаемый или повторяющийся ключ аттестаций. Документы не объединялись и не заменялись другой версией." });
      continue;
    }
    try { document = decodeAssessmentDocument(entry.raw); }
    catch (error) {
      invalid++;
      issue({ level: "error", code: "invalid-document", referenceId: entry.key,
        message: error instanceof SyntaxError ? "Некорректный JSON аттестаций. Исходный текст не включён в отчёт."
          : "Не читается схема аттестаций: проверьте версию, ID, состав, результаты, комиссию и согласованность истории. Записи не исправлялись." });
    }
  }
  if (document && !invalid) for (const finding of await inspectAssessmentDependencies(document, sources, completedAt, signal)) issue(finding);
  const subjectStates = await inspectArchivedSubjectStates(sources.subjects, {
    accounts: sources.accounts, schedule: sources.schedule, assessments: invalid ? undefined : document,
  }, completedAt, signal);
  for (const finding of subjectStates.issues) issues.push(finding);
  checkBackupAbort(signal);
  return { issues, subjectStateSummary: subjectStates.summary, checks: [{ kind: "assessments", key: definition.key, label: definition.label, documents,
    status: !documents ? "absent" : invalid ? "invalid" : "valid",
    ...(document && !invalid ? { revision: document.revision, records: document.assessments.length } : {}),
    message: !documents ? "Аттестации не сохранены в архиве. Данные браузера и примеры не подставляются."
      : invalid ? "Документ аттестаций не прошёл проверку схемы или версии ключа. Исходные данные сохранены."
        : "Схема ведомостей, пересдач, комиссий и истории прочитана; ссылки проверены только по архивным справочникам. Это не подтверждение полномочий и не разрешение на восстановление.",
  }] };
}
