import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createInitialAccountsDocument } from "../../data/accountStore";
import type { StudentBulkPreview } from "../../domain/studentBulk";
import type { StudentBulkReceipt } from "../../domain/studentBulkReceipt";
import StudentOperationReview from "./StudentOperationReview";

const accounts = new Map(createInitialAccountsDocument().accounts.map((account) => [account.id, account]));
const before = { groupId: "112-mko", groupName: "112-МКо", enrollment: "studying" as const };
const after = { ...before, groupId: "113-mko", groupName: "113-МКо" };
const preview: StudentBulkPreview = {
  rows: Array.from({ length: 21 }, (_, index) => ({ accountId: index ? `student-${index}` : "anna-smirnova", name: `Студент №${index + 1}`, outcome: index === 20 ? "error" : "changed", errors: index === 20 ? ["Дата раньше последнего события"] : [], before, after })),
  changed: 20, unchanged: 0, errors: 1, request: { targets: [], action: { kind: "transfer", groupId: "113-mko" } }, fingerprint: "example", expectedRevision: 0, groupRevision: 0, actorRevision: 1,
};
preview.request.targets = preview.rows.map((row) => ({ accountId: row.accountId, revision: 1 }));
const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<MemoryRouter><StudentOperationReview preview={preview} accounts={accounts} filter="all" query="" page={1} onFilter={noop} onQuery={noop} onPage={noop} {...patch} /></MemoryRouter>);

describe("student operation review", () => {
  it("limits the displayed page while counting every error in the package", () => {
    const html = render(); expect(html).toContain("Показано: 1–20 из 21");
    expect(html).toContain("Студент №20"); expect(html).not.toContain("Студент №21");
    expect(html).toMatch(/data-tab="error"[^>]*>Ошибки<span>1<\/span>/);
    expect(html).not.toContain("Применить"); expect(preview.request.targets).toHaveLength(21);
  });
  it("finds the errored student outside the first page without truncating the checked request", () => {
    const html = render({ filter: "error", page: 50 });
    expect(html).toContain("Показано: 1–1 из 1"); expect(html).toContain("Студент №21"); expect(html).toContain("Дата раньше последнего события");
    expect(preview.errors).toBe(1); expect(preview.changed).toBe(20); expect(preview.request.targets).toHaveLength(21);
  });
  it("explains a search that hides all errors while retaining the error count", () => {
    const html = render({ filter: "error", query: "нет совпадений" });
    expect(html).toContain("Показано: 0–0 из 0"); expect(html).toContain("Сбросить поиск и фильтр");
    expect(html).toMatch(/data-tab="error"[^>]*>Ошибки<span>1<\/span>/); expect(html).not.toContain('aria-label="Предпросмотр изменения студентов"');
  });
  it("searches saved receipts and keeps the existing account history link", () => {
    const receipt: StudentBulkReceipt = { id: "saved", fingerprint: "example", actorId: "configurator-demo", occurredAt: "2026-10-28T10:00:00Z", action: preview.request.action, rows: [{ accountId: "anna-smirnova", outcome: "changed", before, after }] };
    const html = render({ receipt, preview: null, query: "Смирнова" });
    expect(html).toContain("Анна Смирнова"); expect(html).toContain("112-МКо · Учится"); expect(html).toContain("113-МКо · Учится");
    expect(html).toContain('/admin/accounts?account=anna-smirnova&amp;mode=history'); expect(html).not.toContain('data-tab="error"'); expect(html).not.toContain("К действиям со списком");
  });
});
