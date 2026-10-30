import { BACKUP_LIMITS } from "../domain/localBackup";
import type { BackupInspection } from "./localBackupInspectionService";
import { assertAdministrativeBackupAccess, type BackupCommand } from "./localBackupService";

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
    const { counts, issues } = report.documents;
    if (counts.errors !== issues.filter((issue) => issue.level === "error").length
      || counts.reviews !== issues.filter((issue) => issue.level === "review").length) {
      throw new Error("В результате проверки отсутствует часть замечаний. Проверьте архив заново; неполный отчёт не скачан.");
    }
    const differences = { new: 0, different: 0, currentOnly: 0, schema: 0 };
    for (const difference of report.comparison.differences) {
      differences[difference.kind === "current-only" ? "currentOnly" : difference.kind]++;
    }
    if ((Object.keys(differences) as (keyof typeof differences)[]).some((kind) => differences[kind] !== report.comparison[kind])) {
      throw new Error("В результате сравнения отсутствует часть различий. Проверьте архив заново; неполный отчёт не скачан.");
    }
    const body = {
      format: "bi-university-backup-inspection", version: 1, scope: "administrative",
      actor: report.actor, inspectedAt: report.inspectedAt,
      archive: { filename: report.filename, sha256: report.sha256, source: report.source, completedAt: report.completedAt, totals: report.totals },
      warnings: report.warnings, documents: report.documents, comparison: report.comparison,
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
