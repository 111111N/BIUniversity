import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BackupPanel from "./BackupPanel";

const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<BackupPanel busy={false} progress="" error="" result={null} unavailable={false} onExport={noop} onCancel={noop} {...patch} />);
describe("backup disclosure and download states", () => {
  it("explains administrative scope, sensitive contents, exclusions and unavailable restoration before download", () => {
    const html = render();
    for (const text of ["Личные данные всех пользователей", "не зашифрован", "Восстановление из файла пока не реализовано", "64 МиБ", "временные черновики", "одновременные изменения"]) expect(html).toContain(text);
    expect(html).toMatch(/<button[^>]*>Скачать резервную копию/); expect(html).not.toContain("Восстановить</button>");
  });
  it("announces progress and exposes cancellation without starting another export", () => {
    const html = render({ busy: true, progress: "Читаем вложения: 1 из 3…" });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Готовим архив/); expect(html).toContain("Отменить</button>");
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"/); expect(html).toContain("Читаем вложения: 1 из 3");
  });
  it("reports handoff to the browser, counts and filename without claiming a file was saved", () => {
    const html = render({ result: { filename: "backup-1.json", completedAt: "now", summary: { storageEntries: 4, databaseRecords: 3, files: 2, binaryBytes: 1_048_576 } } });
    expect(html).toContain("передан браузеру для скачивания"); expect(html).toContain("данные — 4"); expect(html).toContain("вложения — 2 (1 МиБ)"); expect(html).toContain("backup-1.json");
    expect(html).not.toContain("успешно сохранён");
  });
  it("keeps read errors and missing access visible and retry explained", () => {
    const html = render({ unavailable: true, error: "Хранилище недоступно" });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Скачать/); expect(html).toContain('role="alert"'); expect(html).toContain("действующему настройщику"); expect(html).toContain("Хранилище недоступно");
  });
});
