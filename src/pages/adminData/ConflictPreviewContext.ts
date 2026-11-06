import { createContext } from "react";
import type { BackupDifference } from "../../domain/backupComparison";
import type { BackupConflictVersion } from "../../data/localBackupConflictPreviewService";

export const ConflictPreviewContext = createContext<((difference: BackupDifference) => void) | null>(null);
export const ConflictChoiceContext = createContext<ReadonlyMap<string, BackupConflictVersion>>(new Map());
