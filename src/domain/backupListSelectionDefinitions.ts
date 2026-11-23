import type { BaseSelectionDefinition } from "./backupBaseSelection";
import type { BackupRecordDefinition } from "./backupRecordComparison";
import { getPlannerBackupDefinition } from "./backupPlannerComparison";
import { getNotificationBackupDefinition } from "./backupNotificationComparison";
import { getJournalBackupDefinition } from "./backupJournalComparison";
import { BACKUP_PLANNER_DOCUMENTS } from "./backupPlannerDocuments";
import { BACKUP_NOTIFICATION_DOCUMENTS } from "./backupNotificationDocuments";
import { getLearningBackupDefinition } from "./backupLearningComparison";

interface ListFamilyDefinition {
  kind: "planners" | "notifications" | "journals" | "journalHistory" | "assignments" | "submissions";
  target: "planners" | "notifications" | "journals" | "assignments" | "submissions";
  collection: BaseSelectionDefinition["collections"][number]["collection"];
  fallback?: string;
  relativeOrder?: boolean;
  children?: Extract<BackupRecordDefinition<string>, { collection: "submission-attempts" }>;
  definition: {
    label: string; matchesKey(key: string): boolean; supportsKey(key: string): boolean;
    decode(raw: string, key: string): { rows: readonly object[]; envelope: object; children?: readonly object[] };
  };
}
function records(definition: BackupRecordDefinition<string>, children?: BackupRecordDefinition<string>) {
  return {
    label: definition.label, matchesKey: definition.matchesKey, supportsKey: definition.supportsKey,
    decode: (raw: string, key: string) => {
      const rows = definition.decode(raw, key, "archive"), parsed: unknown = JSON.parse(raw);
      const fields = !Array.isArray(parsed) && parsed && typeof parsed === "object" ? { ...parsed } as Record<string, unknown> : undefined;
      if (fields) delete fields[definition.collection === "journal-students" ? "students" : "items"];
      return { rows, envelope: fields ? { shape: "object", fields } : { shape: "array" }, ...(children ? { children: children.decode(raw, key, "archive") } : {}) };
    },
  };
}
const attemptDefinition = getLearningBackupDefinition("submission-attempts")!;
if (attemptDefinition.collection !== "submission-attempts") throw new Error("Не настроена проверка сохранённых попыток ответов.");

export const BACKUP_LIST_FAMILIES: readonly ListFamilyDefinition[] = [
  { kind: "planners", target: "planners", collection: "planner", fallback: BACKUP_PLANNER_DOCUMENTS.planners.key, definition: records(getPlannerBackupDefinition("planner")!) },
  { kind: "notifications", target: "notifications", collection: "notifications", fallback: BACKUP_NOTIFICATION_DOCUMENTS.notifications.key, definition: records(getNotificationBackupDefinition("notifications")!) },
  { kind: "journalHistory", target: "journals", collection: "journal-history", relativeOrder: true, definition: records(getJournalBackupDefinition("journal-history")!) },
  { kind: "journals", target: "journals", collection: "journal-students", definition: records(getJournalBackupDefinition("journal-students")!) },
  { kind: "assignments", target: "assignments", collection: "assignments", fallback: "bi-university-demo-assignments", definition: records(getLearningBackupDefinition("assignments")!) },
  { kind: "submissions", target: "submissions", collection: "submissions", fallback: "bi-university-demo-submissions", children: attemptDefinition, definition: records(getLearningBackupDefinition("submissions")!, attemptDefinition) },
];
