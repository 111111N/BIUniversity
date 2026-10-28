import { MAX_STUDENT_BULK_TARGETS } from "../../domain/studentBulk";
import type { PortalAccount } from "../../domain/accounts";
import type { StudentBulkPreviewRow } from "../../domain/studentBulk";
import { matchesSearchText } from "../../domain/search";

type ReviewRow = Pick<StudentBulkPreviewRow, "accountId" | "outcome" | "before" | "after"> & Partial<Pick<StudentBulkPreviewRow, "name" | "studentNumber">>;
export const filterStudentOperationRows = <T extends ReviewRow>(rows: readonly T[], outcome: string, query: string, accounts: ReadonlyMap<string, PortalAccount>): T[] => rows.filter((row) => {
  const account = accounts.get(row.accountId);
  return (outcome === "all" || row.outcome === outcome) && matchesSearchText(`${row.name ?? account?.name ?? ""} ${account?.login ?? ""} ${row.studentNumber ?? account?.studentRecord?.number ?? ""} ${row.before?.groupName ?? ""} ${row.after?.groupName ?? ""}`, query);
});
export const getStudentPageSelection = (selected: ReadonlySet<string>, ids: string[]) => {
  const unique = [...new Set(ids)];
  const onPage = unique.filter((id) => selected.has(id)).length;
  const all = unique.length > 0 && onPage === unique.length;
  return { all, onPage, offPage: selected.size - onPage, canToggle: all || selected.size + unique.length - onPage <= MAX_STUDENT_BULK_TARGETS };
};
export const toggleStudentPageSelection = (selected: ReadonlySet<string>, ids: string[]) => {
  const state = getStudentPageSelection(selected, ids);
  const next = new Set(selected);
  if (!state.canToggle) return next;
  for (const id of ids) if (state.all) next.delete(id); else next.add(id);
  return next;
};
