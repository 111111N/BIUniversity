import type { BackupDifference, BackupDifferenceKind } from "../../data/localBackupInspectionService";
import { matchesSearchText } from "../../domain/search";

export const BACKUP_DIFFERENCE_LABELS: Record<BackupDifferenceKind, string> = { new: "Только в архиве", different: "Содержимое отличается", "current-only": "Только в браузере", schema: "Различие структуры" };
export interface BackupDifferenceQuery { kind: "all" | BackupDifferenceKind; area: string | null; search: string; page: number }
export const emptyBackupDifferenceQuery = (): BackupDifferenceQuery => ({ kind: "all", area: null, search: "", page: 1 });
export const changeBackupDifferenceQuery = (query: BackupDifferenceQuery, patch: Partial<Omit<BackupDifferenceQuery, "page">>): BackupDifferenceQuery => ({ ...query, ...patch, page: 1 });
export const getBackupDifferencePage = (differences: readonly BackupDifference[], query: BackupDifferenceQuery) => {
  const matching = differences.filter((item) => (query.kind === "all" || item.kind === query.kind)
    && (query.area === null || item.area === query.area)
    && matchesSearchText(`${BACKUP_DIFFERENCE_LABELS[item.kind]} ${item.area} ${item.id}`, query.search));
  const pages = Math.max(1, Math.ceil(matching.length / 20));
  const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { total: matching.length, pages, page, rows: matching.slice((page - 1) * 20, page * 20) };
};
