import type { BackupValue } from "./localBackup";
import { canonicalBackupValue } from "./localBackupValidation";
import type { BackupFileDifferenceDetails } from "./backupFileDifference";

export type BackupDifferenceKind = "new" | "different" | "current-only" | "schema";
export type BackupDifferenceReference =
  | { storage: "localStorage"; key: string }
  | { storage: "localStorage-record"; key: string; collection: "planner" | "groups" | "subjects" | "group-history" | "subject-history" | "accounts" | "account-history" | "education-events" | "journal-history" | "notifications" | "assignments" | "submissions" | "schedule-drafts" | "schedule-published" | "assessments" | "assessment-history" | "assessment-corrections" | "assessment-correction-history"; id: string }
  | { storage: "localStorage-child-record"; key: string; collection: "submission-attempts"; parentId: string; id: string }
  | { storage: "localStorage-journal-record"; key: string; collection: "schedule-journal"; subjectId: string; groupId: string; id: string }
  | { storage: "indexedDB"; database: string; store: string; key: BackupValue }
  | { storage: "schema"; database: string; store?: string };
export interface BackupDifference { kind: BackupDifferenceKind; area: string; id: string; reference?: BackupDifferenceReference; fileDifference?: BackupFileDifferenceDetails }

// Display labels and stringified keys are not unique storage addresses.
export const getBackupDifferenceKey = (difference: BackupDifference) => {
  const reference = difference.reference;
  if (!reference) return JSON.stringify(["legacy", difference.kind, difference.area, difference.id]);
  if (reference.storage === "localStorage") return JSON.stringify([reference.storage, difference.kind, reference.key]);
  if (reference.storage === "localStorage-record") return JSON.stringify([reference.storage, difference.kind, reference.key, reference.collection, reference.id]);
  if (reference.storage === "localStorage-child-record") return JSON.stringify([reference.storage, difference.kind, reference.key, reference.collection, reference.parentId, reference.id]);
  if (reference.storage === "localStorage-journal-record") return JSON.stringify([reference.storage, difference.kind, reference.key, reference.collection, reference.id, reference.subjectId, reference.groupId]);
  if (reference.storage === "schema") return JSON.stringify([reference.storage, difference.kind, reference.database, reference.store ?? null]);
  return JSON.stringify([reference.storage, difference.kind, reference.database, reference.store, canonicalBackupValue(reference.key)]);
};

export const getBackupDifferenceKeyLabel = (difference: BackupDifference) => {
  if (difference.reference?.storage === "localStorage-child-record") return `Ответ: ${difference.reference.parentId}`;
  if (difference.reference?.storage === "localStorage-journal-record") return `Дисциплина: ${difference.reference.subjectId} · Группа: ${difference.reference.groupId}`;
  if (difference.reference?.storage !== "indexedDB") return "";
  switch (difference.reference.key.type) {
    case "string": return "Ключ: строка";
    case "number": return "Ключ: число";
    case "date": return "Ключ: дата";
    case "array": return "Ключ: составной";
    default: return "";
  }
};
