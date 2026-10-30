import { BACKUP_DOCUMENTS, type BackupDocumentIssue, type BackupDocumentKind } from "../../domain/localBackupDocuments";
import { matchesSearchText } from "../../domain/search";

export interface DocumentIssueQuery { level: "all" | "error" | "review"; area: "all" | BackupDocumentKind; search: string; page: number }
export const emptyDocumentIssueQuery = (): DocumentIssueQuery => ({ level: "all", area: "all", search: "", page: 1 });
export const changeDocumentIssueQuery = (query: DocumentIssueQuery, patch: Partial<Omit<DocumentIssueQuery, "page">>): DocumentIssueQuery => ({ ...query, ...patch, page: 1 });
export const getDocumentIssuePage = (issues: readonly BackupDocumentIssue[], query: DocumentIssueQuery) => {
  const matching = issues.filter((issue) => (query.level === "all" || issue.level === query.level)
    && (query.area === "all" || issue.kind === query.area)
    && matchesSearchText(`${BACKUP_DOCUMENTS[issue.kind].label} ${issue.message} ${issue.code} ${issue.referenceId ?? ""} ${issue.recordId ?? ""}`, query.search));
  const pages = Math.max(1, Math.ceil(matching.length / 10));
  const page = Math.min(Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1, pages);
  return { total: matching.length, pages, page, rows: matching.slice((page - 1) * 10, page * 10) };
};
