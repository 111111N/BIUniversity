import { decodePlannerBackupNotes, isBackupPlannerKey } from "./backupPlannerDocuments";
import { getPlannerStorageOwner } from "./plannerStorage";
import { assertCompleteBackupRecordComparison, compareBackupRecords, type BackupRecordComparison, type BackupRecordDefinition, type BackupRecordDifference, type BackupRecordEntries, type BackupUncomparedDocument } from "./backupRecordComparison";

const FIELDS = ["title", "text", "createdAt", "startAt", "endAt", "completed", "priority", "category"] as const;
export type PlannerComparedField = typeof FIELDS[number] | "other";
export type PlannerRecordDifference = BackupRecordDifference<PlannerComparedField>;
export type PlannerUncomparedDocument = BackupUncomparedDocument;
export type BackupPlannerComparison = BackupRecordComparison<PlannerComparedField>;
const definition: BackupRecordDefinition<PlannerComparedField> = {
  collection: "planner", label: "Планировщик", fields: FIELDS,
  matchesKey: isBackupPlannerKey, supportsKey: (key) => getPlannerStorageOwner(key) !== undefined,
  decode: decodePlannerBackupNotes,
  errors: {
    text: "Списки планировщика превышают лимит сравнения 16 МиБ. Частичный результат не создан.",
    records: "В списках планировщика больше 25 000 задач. Частичный результат сравнения не создан.",
    output: "Результат сравнения задач превышает лимит 16 МиБ. Частичный результат не создан.",
    incomplete: "В результате сравнения задач отсутствует часть записей. Проверьте архив заново; неполный отчёт не скачан.",
  },
};

export const compareBackupPlannerRecords = (archive: BackupRecordEntries, browser: BackupRecordEntries, signal?: AbortSignal): Promise<BackupPlannerComparison> => compareBackupRecords(archive, browser, definition, signal);
export const assertCompletePlannerComparison = (review: BackupPlannerComparison) => assertCompleteBackupRecordComparison(review, definition);
export const getPlannerBackupDefinition = (collection: string): BackupRecordDefinition<string> | undefined => collection === definition.collection ? definition : undefined;
