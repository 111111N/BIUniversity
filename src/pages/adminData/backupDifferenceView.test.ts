import { describe, expect, it } from "vitest";
import type { BackupDifference } from "../../data/localBackupInspectionService";
import { changeBackupDifferenceQuery, emptyBackupDifferenceQuery, getBackupDifferencePage } from "./backupDifferenceView";

const kinds = ["new", "different", "current-only", "schema"] as const;
const differences: BackupDifference[] = Array.from({ length: 230 }, (_, index) => ({ kind: kinds[index % 4], area: index % 2 ? "Материалы" : "Локальные данные", id: `record-${index}` }));
describe("archive difference view", () => {
  it("finds journal records by exact subject/group IDs without multiplying area options", () => {
    const rows: BackupDifference[] = ["1", "2"].map((suffix) => ({ kind: "different", area: "Связи занятий с журналом", id: "managed:same", reference: { storage: "localStorage-journal-record", key: "bi-university-managed-schedule-v1", collection: "schedule-journal", id: "managed:same", subjectId: `subject-${suffix}`, groupId: `group-${suffix}` } }));
    expect(new Set(rows.map((row) => row.area)).size).toBe(1);
    expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), search: "subject-2 group-2" }).rows).toEqual([rows[1]]);
  });
  it("finds a scoped attempt by parent ID without creating one area option per answer", () => {
    const rows: BackupDifference[] = ["answer-1", "answer-2"].map((parentId) => ({ kind: "different", area: "Попытки ответов · bi-university-demo-submissions", id: "attempt-1", reference: { storage: "localStorage-child-record", key: "bi-university-demo-submissions", collection: "submission-attempts", parentId, id: "attempt-1" } }));
    expect(new Set(rows.map((row) => row.area)).size).toBe(1);
    expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), search: "answer-2" }).rows).toEqual([rows[1]]);
  });
  it("finds the displayed key type without confusing identical-looking file IDs", () => {
    const common = { kind: "different" as const, area: "Файлы", id: '["number",1]' };
    const rows: BackupDifference[] = [
      { ...common, reference: { storage: "indexedDB", database: "db", store: "files", key: { type: "number", value: 1 } } },
      { ...common, reference: { storage: "indexedDB", database: "db", store: "files", key: { type: "string", value: common.id } } },
    ];
    expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), search: "число" }).rows).toEqual([rows[0]]);
    expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), search: "строка" }).rows).toEqual([rows[1]]);
  });
  it("retains all differences and exposes the last page after 200 without changing the report source", () => {
    const before = JSON.stringify(differences); const view = getBackupDifferencePage(differences, { ...emptyBackupDifferenceQuery(), page: 12 });
    expect(view).toMatchObject({ total: 230, pages: 12, page: 12 }); expect(view.rows).toHaveLength(10); expect(view.rows.at(-1)!.id).toBe("record-229");
    expect(JSON.stringify(differences)).toBe(before);
  });
  it("combines type, exact area and search words across labels and technical IDs", () => {
    const query = { ...emptyBackupDifferenceQuery(), kind: "different" as const, area: "Материалы", search: "МАТЕРИАЛЫ record-229" };
    expect(getBackupDifferencePage(differences, query).rows).toEqual([differences[229]]);
    expect(getBackupDifferencePage(differences, { ...query, kind: "schema" }).total).toBe(0);
    expect(getBackupDifferencePage(differences, { ...query, area: "Локальные данные" }).total).toBe(0);
  });
  it("finds browser-only entries by their displayed type without implying deletion", () => {
    expect(getBackupDifferencePage(differences, { ...emptyBackupDifferenceQuery(), search: "Только браузере record-218" }).rows).toEqual([differences[218]]);
  });
  it("resets pagination for a filter change and clamps an obsolete page", () => {
    const query = { ...emptyBackupDifferenceQuery(), page: 12 };
    const changed = changeBackupDifferenceQuery(query, { search: "record-229" }); expect(changed.page).toBe(1); expect(query.page).toBe(12);
    expect(getBackupDifferencePage(differences, { ...changed, page: 12 })).toEqual({ page: 1, pages: 1, total: 1, rows: [differences[229]] });
  });
  it("distinguishes no matches from an empty complete report and supports a full filter reset", () => {
    const query = changeBackupDifferenceQuery(emptyBackupDifferenceQuery(), { search: "not-found", area: "Материалы", kind: "different" });
    expect(getBackupDifferencePage(differences, query)).toEqual({ page: 1, pages: 1, total: 0, rows: [] });
    expect(getBackupDifferencePage(differences, emptyBackupDifferenceQuery()).total).toBe(230);
    expect(getBackupDifferencePage([], emptyBackupDifferenceQuery())).toEqual({ page: 1, pages: 1, total: 0, rows: [] });
  });
  it("preserves punctuation and distinct areas while handling blank searches and invalid pages", () => {
    const rows: BackupDifference[] = [{ kind: "new", area: "a:b", id: "c" }, { kind: "new", area: "a", id: "b:c" }];
    expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), area: "a:b" }).rows).toEqual([rows[0]]);
    expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), search: " " }).total).toBe(2);
    for (const page of [0, -1, NaN, Infinity, 1.5]) expect(getBackupDifferencePage(rows, { ...emptyBackupDifferenceQuery(), page }).page).toBe(1);
  });
});
