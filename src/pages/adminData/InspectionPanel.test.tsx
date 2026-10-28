import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InspectionPanel from "./InspectionPanel";
import type { BackupInspection } from "../../data/localBackupInspectionService";

const noop = () => undefined;
const result: BackupInspection = {
  filename: "archive.json", source: { origin: "https://portal.example", basePath: "/" }, completedAt: "2026-10-28T10:00:00Z", inspectedAt: "2026-10-28T10:00:00Z", sha256: "abc123",
  totals: { storageEntries: 4, databaseRecords: 3, files: 2, binaryBytes: 2 }, warnings: ["Архив не подписан"],
  comparison: { same: 1, new: 2, different: 3, currentOnly: 4, schema: 0, differences: [] },
  documents: { checks: [], issues: [], counts: { valid: 0, invalid: 0, absent: 4, unchecked: 0, errors: 0, reviews: 0, hiddenIssues: 0 } },
};
const render = (patch = {}) => renderToStaticMarkup(<InspectionPanel file={null} busy={false} progress="" error="" result={null} unavailable={false} onFile={noop} onInspect={noop} onCancel={noop} {...patch} />);
describe("backup file preview", () => {
  it("has an explicit labelled file chooser and no restore or upload action", () => {
    const html = render();
    expect(html).toContain('for="backup-file"'); expect(html).toContain('type="file"'); expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain("без отправки на сервер"); expect(html).toContain("Восстановление пока недоступно"); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Проверить файл/);
    expect(html).not.toContain("Восстановить</button>");
  });
  it("announces progress, supports cancellation and locks the file selector", () => {
    const html = render({ busy: true, progress: "Сравниваем вложения…" });
    expect(html).toMatch(/type="file"[^>]*disabled=""/); expect(html).toContain("Отменить</button>"); expect(html).toMatch(/role="status"[^>]*aria-live="polite"/); expect(html).toContain("Сравниваем вложения…");
  });
  it("distinguishes readonly format checking from restoration and exposes comparison limitations", () => {
    const html = render({ result });
    for (const value of ["данные не восстановлены", "а не студенты", "Совпадают", "Только в браузере", "Архив не подписан", "abc123", "учебных связей"]) expect(html).toContain(value);
  });
  it("limits the visible difference list and escapes archive names and IDs", () => {
    const comparison = { ...result.comparison, differences: Array.from({ length: 43 }, (_, index) => ({ kind: "different" as const, area: "Материалы", id: index === 0 ? "<script>bad()</script>" : `record-${index}` })) };
    const html = render({ result: { ...result, filename: "<b>archive</b>", comparison } });
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3"); expect(html).not.toContain("record-20");
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<b>archive</b>");
  });
  it("retains an actionable file check error and blocks unavailable accounts", () => {
    const html = render({ unavailable: true, error: "Формат не поддерживается", file: new File(["{}"], "wrong.json") });
    expect(html).toContain("wrong.json"); expect(html).toContain("Формат не поддерживается"); expect(html).toContain('role="alert"'); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Проверить файл/);
  });
});
