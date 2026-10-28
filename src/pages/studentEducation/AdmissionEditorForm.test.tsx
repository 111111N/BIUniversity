import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdmissionEditorForm from "./AdmissionEditorForm";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z")); });
afterEach(() => vi.useRealTimers());
const value = { effectiveDate: "2026-10-28", basis: "", documentNumber: "Мой документ" };
const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<AdmissionEditorForm value={value} disabled={false} stale={false} busy={false} onRefresh={noop} onChange={noop} onSubmit={noop} onCancel={noop} {...patch} />);
describe("admission editing form", () => {
  it("keeps an ineligible admission disabled while preserving editable document fields", () => {
    const html = render({ restriction: "История обучения уже начата." });
    expect(html).toContain("История обучения уже начата"); expect(html).toContain('value="Мой документ"'); expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
  it("lets an incomplete form be submitted for field validation without browser popups", () => {
    const html = render();
    expect(html).toContain('aria-label="Подтверждение зачисления" noValidate=""');
    expect(html).not.toContain('aria-invalid="true"'); expect(html).not.toContain("Проверьте отмеченные поля");
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*type="submit"[^>]*>Сохранить зачисление/);
  });
  it("retains the document and explains stale data or source failure before a disabled save", () => {
    const stale = render({ stale: true }); const unavailable = render({ disabled: true });
    for (const html of [stale, unavailable]) {
      expect(html).toContain('value="Мой документ"');
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    }
    expect(stale).toContain("Сведения изменились"); expect(stale).toContain('role="alert"'); expect(stale).not.toMatch(/<fieldset[^>]*disabled/);
    expect(stale).toContain("Обновить проверку</button>"); expect(stale).not.toContain("Отмените форму");
    expect(unavailable).toContain("Повторить чтение"); expect(unavailable).toMatch(/<fieldset[^>]*disabled/);
  });
  it("disables editing, calendars and cancellation during the explicit save", () => {
    const html = render({ busy: true });
    expect(html).toMatch(/<fieldset[^>]*disabled/); expect(html).toContain("Сохраняем событие зачисления");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Отмена/);
    expect((html.match(/<button[^>]*aria-haspopup="dialog"[^>]*disabled=""/g) ?? []).length).toBe(2);
  });
});
