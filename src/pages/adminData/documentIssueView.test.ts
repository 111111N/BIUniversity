import { describe, expect, it } from "vitest";
import type { BackupDocumentIssue } from "../../domain/localBackupDocuments";
import { changeDocumentIssueQuery, emptyDocumentIssueQuery, getDocumentIssuePage } from "./documentIssueView";

const issues: BackupDocumentIssue[] = Array.from({ length: 230 }, (_, index) => ({ kind: index % 2 ? "materials" : "accounts", level: index % 3 ? "review" : "error", code: `finding-${index}`, message: index === 218 ? "Владелец не найден" : "Проверить связь", referenceId: `reference-${index}`, recordId: `record-${index}` }));
describe("archive finding view", () => {
  it("keeps all source issues and paginates beyond the old 200-result boundary", () => {
    const before = JSON.stringify(issues); const view = getDocumentIssuePage(issues, { ...emptyDocumentIssueQuery(), page: 23 });
    expect(view).toMatchObject({ page: 23, pages: 23, total: 230 }); expect(view.rows).toHaveLength(10); expect(view.rows.at(-1)!.recordId).toBe("record-229"); expect(JSON.stringify(issues)).toBe(before);
  });
  it("combines type, area and words across visible text and technical IDs", () => {
    const query = { ...emptyDocumentIssueQuery(), level: "review" as const, area: "accounts" as const, search: "ВЛАДЕЛЕЦ record-218" };
    expect(getDocumentIssuePage(issues, query).rows).toEqual([issues[218]]);
    expect(getDocumentIssuePage(issues, { ...query, area: "materials" }).total).toBe(0);
    expect(getDocumentIssuePage(issues, { ...query, level: "error" }).total).toBe(0);
  });
  it("searches labels and codes without consulting source records", () => {
    expect(getDocumentIssuePage(issues, { ...emptyDocumentIssueQuery(), search: "Материалы finding-229" }).rows).toEqual([issues[229]]);
    expect(getDocumentIssuePage(issues, { ...emptyDocumentIssueQuery(), search: "reference-218" }).rows).toEqual([issues[218]]);
  });
  it("resets pagination when any filter changes and clamps an obsolete page", () => {
    const query = { ...emptyDocumentIssueQuery(), page: 23 };
    const changed = changeDocumentIssueQuery(query, { search: "record-218" }); expect(changed.page).toBe(1); expect(query.page).toBe(23);
    const view = getDocumentIssuePage(issues, { ...changed, page: 23 }); expect(view).toMatchObject({ page: 1, pages: 1, total: 1 }); expect(view.rows).toEqual([issues[218]]);
  });
  it("distinguishes no matches from the full source list and resets all filters", () => {
    const query = changeDocumentIssueQuery(emptyDocumentIssueQuery(), { search: "no-such-id" });
    expect(getDocumentIssuePage(issues, query)).toEqual({ page: 1, pages: 1, total: 0, rows: [] });
    expect(getDocumentIssuePage(issues, emptyDocumentIssueQuery()).total).toBe(230);
  });
  it("handles empty archives, blank search and invalid page numbers", () => {
    expect(getDocumentIssuePage([], emptyDocumentIssueQuery())).toEqual({ page: 1, pages: 1, total: 0, rows: [] });
    expect(getDocumentIssuePage(issues, { ...emptyDocumentIssueQuery(), search: "  " }).total).toBe(230);
    for (const page of [0, -1, NaN, Infinity, 1.5]) expect(getDocumentIssuePage(issues, { ...emptyDocumentIssueQuery(), page }).page).toBe(1);
  });
});
