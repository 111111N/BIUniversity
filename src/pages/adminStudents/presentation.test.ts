import { describe, expect, it } from "vitest";
import { filterStudentOperationRows, getStudentPageSelection, toggleStudentPageSelection } from "./presentation";
import { getBatchApplyHint } from "../../components/BatchWorkflow/presentation";
import { createInitialAccountsDocument } from "../../data/accountStore";
import type { StudentBulkPreviewRow } from "../../domain/studentBulk";
describe("batch selection presentation", () => {
  it("counts selection outside the current page and preserves it when toggling this page", () => {
    const selected = new Set(["other", "one"]);
    expect(getStudentPageSelection(selected, ["one", "two"])).toEqual({ all: false, onPage: 1, offPage: 1, canToggle: true });
    const added = toggleStudentPageSelection(selected, ["one", "two"]);
    expect([...toggleStudentPageSelection(added, ["one", "two"])]).toEqual(["other"]);
    expect([...selected]).toEqual(["other", "one"]);
  });
  it("rejects an entire page exceeding the limit and still allows deselection", () => {
    const selected = new Set(Array.from({ length: 1000 }, (_, i) => String(i)));
    expect(getStudentPageSelection(selected, ["0", "extra"]).canToggle).toBe(false);
    expect(toggleStudentPageSelection(selected, ["0", "extra"])).toEqual(selected);
    expect(toggleStudentPageSelection(selected, ["0", "1"]).size).toBe(998);
  });
  it("accepts the exact limit and handles empty pages", () => {
    const selected = new Set(Array.from({ length: 999 }, (_, i) => String(i)));
    expect(toggleStudentPageSelection(selected, ["999", "999"]).size).toBe(1000);
    expect(getStudentPageSelection(new Set(), []).all).toBe(false);
  });
  it("explains stale, invalid and unchanged previews before applying a batch", () => {
    const base = { busy: false, blocked: false, stale: false, errors: 0, changed: 3 };
    expect(getBatchApplyHint({ ...base, stale: true })).toContain("Обновите");
    expect(getBatchApplyHint({ ...base, errors: 2 })).toContain("2");
    expect(getBatchApplyHint({ ...base, changed: 0 })).toContain("Нет новых");
    expect(getBatchApplyHint(base)).toContain("других страницах");
  });
});

describe("student operation result search", () => {
  const accounts = new Map(createInitialAccountsDocument().accounts.map((account) => [account.id, account]));
  const before = { groupId: "old", groupName: "112-МКо", enrollment: "studying" as const };
  const after = { ...before, groupId: "new", groupName: "113-МКо" };
  const rows: StudentBulkPreviewRow[] = [
    { accountId: "anna-smirnova", name: "Анна Семёнова", studentNumber: "202630001", outcome: "changed", errors: [], before, after },
    { accountId: "missing", name: "Второй студент", outcome: "error", errors: ["Исходная группа недоступна"] },
  ];
  it.each(["СЕМЕНОВА анна", "anna.smirnova", "202630001", "112-МКо 113-МКо"])("finds a preview by name, login, number or both groups: %s", (query) => {
    expect(filterStudentOperationRows(rows, "all", query, accounts)).toEqual([rows[0]]);
  });
  it("combines status and search without changing the snapshot or dropping errors from the actual package", () => {
    const original = structuredClone(rows);
    expect(filterStudentOperationRows(rows, "error", "анна", accounts)).toEqual([]);
    expect(filterStudentOperationRows(rows, "error", "", accounts)).toEqual([rows[1]]);
    expect(filterStudentOperationRows(rows, "all", "", accounts)).toEqual(rows); expect(rows).toEqual(original);
  });
  it("searches receipt rows with current account identity and immutable group snapshots", () => {
    const receipt = [{ accountId: "anna-smirnova", outcome: "changed" as const, before, after }];
    expect(filterStudentOperationRows(receipt, "changed", "Смирнова 113-МКо", accounts)).toEqual(receipt);
    expect(filterStudentOperationRows(receipt, "unchanged", "", accounts)).toEqual([]);
  });
  it("uses the displayed preview name ahead of a later changed account name", () => {
    expect(filterStudentOperationRows(rows, "all", "Смирнова", accounts)).toEqual([]);
    expect(filterStudentOperationRows(rows, "all", "недоступно", accounts)).toEqual([]);
  });
});
