import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ConflictPreviewDialog from "./ConflictPreviewDialog";
import DifferenceReview from "./DifferenceReview";
import { ConflictPreviewContext } from "./ConflictPreviewContext";
import type { BackupDifference } from "../../domain/backupComparison";
import type { BackupRecordPreview } from "../../domain/backupRecordPreview";
import { getPlannerStorageKey } from "../../domain/plannerStorage";

vi.mock("../../components/Modal", () => ({ default: ({ children, labelledBy }: { children: ReactNode; labelledBy: string }) => <div role="dialog" aria-labelledby={labelledBy}>{children}</div> }));
const difference: BackupDifference = { kind: "different", area: "Планировщик", id: "note-1", reference: { storage: "localStorage-record", key: getPlannerStorageKey("student-1"), collection: "planner", id: "note-1" } };
const preview: BackupRecordPreview = { collectionLabel: "Планировщик", reference: difference.reference as BackupRecordPreview["reference"], rows: [{ field: "text", label: "Текст", archive: '"<script>PRIVATE OLD</script>"', browser: '"PRIVATE NEW"' }], hasUnpreviewedFields: false };
const noop = () => {};
describe("controlled conflict preview UI", () => {
  it("offers preferences in the existing difference list with no default version or automatic application", () => {
    const key = "bi-university-theme";
    const setting: BackupDifference = { kind: "different", area: "Локальные данные", id: key, reference: { storage: "localStorage", key } };
    const unsupported = { ...setting, id: "bi-university-demo-role", reference: { storage: "localStorage" as const, key: "bi-university-demo-role" } };
    const list = renderToStaticMarkup(<ConflictPreviewContext.Provider value={noop}><DifferenceReview differences={[setting, unsupported]} /></ConflictPreviewContext.Provider>);
    expect((list.match(/Сравнить версии<\/button>/g) ?? []).length).toBe(1);
    const html = renderToStaticMarkup(<ConflictPreviewDialog difference={setting} preview={{ reference: setting.reference as BackupRecordPreview["reference"], collectionLabel: "Настройки интерфейса", rows: [{ field: "value", label: "Тема интерфейса", archive: "Тёмная тема (dark)", browser: "Светлая тема (light)" }], hasUnpreviewedFields: false }} error="" onChoose={noop} onClose={noop} />);
    expect(html).toContain("Светлая тема (light)"); expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(2); expect(html).not.toContain("Восстановить</button>");
  });
  it("keeps loading cancellable and does not imply data was restored", () => {
    const html = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={null} error="" onClose={noop} />);
    expect(html).toContain('role="status"'); expect(html).toContain("Проверяем доступ и актуальность версий"); expect(html).toContain('aria-label="Закрыть сравнение версий"');
    expect(html).not.toContain("Восстановить</button>"); expect(html).not.toContain("PRIVATE");
  });
  it("shows changed values as escaped text under explicit source headings", () => {
    const html = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={preview} error="" onClose={noop} />);
    expect(html).toContain("Архив</dt>"); expect(html).toContain("Этот браузер</dt>"); expect(html).toContain("&lt;script&gt;PRIVATE OLD&lt;/script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("восстановление не запускается"); expect(html).not.toContain('type="radio"'); expect(html).not.toContain('type="checkbox"');
  });
  it("hides stale values on error and asks for a fresh check", () => {
    const html = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={preview} error="Проверьте файл заново" onClose={noop} />);
    expect(html).toContain('role="alert"'); expect(html).toContain("Проверьте файл заново"); expect(html).not.toContain("PRIVATE");
  });
  it("explicitly marks unsupported extra fields instead of silently showing a partial version", () => {
    const html = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={{ ...preview, rows: [], hasUnpreviewedFields: true }} error="" onClose={noop} />);
    expect(html).toContain("это сравнение не охватывает их значения"); expect(html).not.toContain("PRIVATE");
  });
  it("does not preselect a version and disables choices for unsupported fields", () => {
    const html = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={preview} error="" onChoose={noop} onClose={noop} />);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(2); expect(html).not.toContain('aria-pressed="true"');
    const blocked = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={{ ...preview, hasUnpreviewedFields: true }} error="" onChoose={noop} onClose={noop} />);
    expect((blocked.match(/disabled=""/g) ?? []).length).toBe(2);
    const chosen = renderToStaticMarkup(<ConflictPreviewDialog difference={difference} preview={preview} choice="browser" error="" onChoose={noop} onClose={noop} />);
    expect(chosen).toContain("В черновике выбрана версия: этот браузер"); expect(chosen).not.toContain("Восстановить</button>");
  });
  it("offers an explicit preview only for supported record conflicts inside an active context", () => {
    const differences: BackupDifference[] = [difference, { ...difference, kind: "new" }, { kind: "different", area: "Документ", id: "key", reference: { storage: "localStorage", key: "key" } }];
    const hidden = renderToStaticMarkup(<DifferenceReview differences={differences} />); expect(hidden).not.toContain("Сравнить версии</button>");
    const shown = renderToStaticMarkup(<ConflictPreviewContext.Provider value={noop}><DifferenceReview differences={differences} /></ConflictPreviewContext.Provider>);
    expect((shown.match(/Сравнить версии<\/button>/g) ?? []).length).toBe(1); expect(shown).not.toContain("PRIVATE");
  });
});
