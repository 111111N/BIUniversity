import { BACKUP_LIMITS } from "../domain/localBackup";
import type { BackupInspection } from "./localBackupInspectionService";
import { assertAdministrativeBackupAccess, type BackupCommand } from "./localBackupService";
import { assertCompletePlannerComparison } from "../domain/backupPlannerComparison";
import { assertCompleteCatalogComparison } from "../domain/backupCatalogComparison";
import { assertCompleteAccountComparison } from "../domain/backupAccountComparison";
import { assertCompleteLearningComparison } from "../domain/backupLearningComparison";
import { assertCompleteScheduleComparison } from "../domain/backupScheduleComparison";
import { assertCompleteScheduleCatalogComparison } from "../domain/backupScheduleCatalogComparison";
import { assertCompleteAcademicComparison } from "../domain/backupAcademicComparison";
import { assertCompleteJournalComparison, assertCompleteJournalSnapshotComparison } from "../domain/backupJournalComparison";
import { assessBackupRestoreAdmission } from "../domain/backupRestoreAdmission";
import { assertCompleteNotificationComparison } from "../domain/backupNotificationComparison";
import { assertBackupFileDifferenceDetails } from "../domain/backupFileDifference";
import { assertCompleteAssessmentComparison } from "../domain/backupAssessmentComparison";
import { assertCompleteBackupDocumentReview } from "../domain/backupDocumentReviewIntegrity";

type ReportCommand = Pick<BackupCommand, "actorId" | "actorRevision"> & { inspection: BackupInspection };

export const prepareBackupInspectionReport = (
  command: ReportCommand,
  authorize: typeof assertAdministrativeBackupAccess = assertAdministrativeBackupAccess,
) => {
  try {
    authorize(command);
    const report = command.inspection;
    if (report.actor.id !== command.actorId || report.actor.revision !== command.actorRevision) {
      throw new Error("Учётная запись изменилась после проверки. Проверьте архив заново перед скачиванием отчёта.");
    }
    assertCompleteBackupDocumentReview(report.documents);
    const differences = { new: 0, different: 0, currentOnly: 0, schema: 0 };
    for (const difference of report.comparison.differences) {
      assertBackupFileDifferenceDetails(difference);
      differences[difference.kind === "current-only" ? "currentOnly" : difference.kind]++;
    }
    if ((Object.keys(differences) as (keyof typeof differences)[]).some((kind) => differences[kind] !== report.comparison[kind])) {
      throw new Error("В результате сравнения отсутствует часть различий. Проверьте архив заново; неполный отчёт не скачан.");
    }
    if (report.plannerComparison) assertCompletePlannerComparison(report.plannerComparison);
    if (report.catalogComparison) assertCompleteCatalogComparison(report.catalogComparison);
    if (report.accountComparison) assertCompleteAccountComparison(report.accountComparison);
    if (report.learningComparison) assertCompleteLearningComparison(report.learningComparison);
    if (report.scheduleComparison) assertCompleteScheduleComparison(report.scheduleComparison);
    if (report.scheduleCatalogComparison) assertCompleteScheduleCatalogComparison(report.scheduleCatalogComparison);
    if (report.academicComparison) assertCompleteAcademicComparison(report.academicComparison);
    if (report.journalComparison) assertCompleteJournalComparison(report.journalComparison);
    if (report.journalSnapshotComparison) assertCompleteJournalSnapshotComparison(report.journalSnapshotComparison);
    if (report.notificationComparison) assertCompleteNotificationComparison(report.notificationComparison);
    if (report.assessmentComparison) assertCompleteAssessmentComparison(report.assessmentComparison);
    const body = {
      format: "bi-university-backup-inspection", version: 1, scope: "administrative",
      actor: report.actor, inspectedAt: report.inspectedAt,
      archive: { filename: report.filename, sha256: report.sha256, source: report.source, completedAt: report.completedAt, totals: report.totals },
      warnings: report.warnings, documents: report.documents, comparison: report.comparison, plannerComparison: report.plannerComparison, catalogComparison: report.catalogComparison, accountComparison: report.accountComparison, learningComparison: report.learningComparison, scheduleComparison: report.scheduleComparison, journalComparison: report.journalComparison, journalSnapshotComparison: report.journalSnapshotComparison,
      restoreAdmission: assessBackupRestoreAdmission(report.documents),
      notificationComparison: report.notificationComparison,
      assessmentComparison: report.assessmentComparison,
      scheduleCatalogComparison: report.scheduleCatalogComparison,
      academicComparison: report.academicComparison,
    };
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json;charset=utf-8" });
    if (blob.size > BACKUP_LIMITS.archiveBytes) throw new Error("Отчёт превышает лимит 128 МиБ. Частичный файл не скачан.");
    authorize(command);
    return { blob, filename: `bi-university-inspection-${new Date(report.inspectedAt).toISOString().replace(/[:.]/g, "-")}.json` };
  } catch (error) {
    console.error("Не удалось подготовить полный отчёт проверки резервной копии:", error);
    throw error;
  }
};
