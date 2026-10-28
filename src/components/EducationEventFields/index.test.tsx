import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EducationEventFields from "./index";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z")); });
afterEach(() => vi.useRealTimers());
const value = { effectiveDate: "2026-10-29", basis: " ", documentNumber: "x".repeat(81), documentDate: "2026-02-30" };
const render = (patch = {}) => renderToStaticMarkup(<EducationEventFields value={value} onChange={() => undefined} {...patch} />);
describe("education fields and accessible calendar errors", () => {
  it("starts quietly and keeps optional document fields collapsed", () => {
    const html = render();
    expect(html).not.toContain('aria-invalid="true"'); expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain("Дата действия (обязательно)"); expect(html).toContain("Основание (обязательно)");
    expect(html).toContain("Реквизиты документа · необязательно");
  });
  it("connects all four errors to their controls and reveals the invalid document", () => {
    const html = render({ showErrors: true });
    expect((html.match(/(?:aria|data)-invalid="true"/g) ?? []).length).toBe(4);
    for (const field of ["effectiveDate", "basis", "documentNumber", "documentDate"]) {
      const control = html.match(new RegExp(`<(?:button|textarea|input)[^>]* id="([^"]+-${field})"[^>]*>`));
      const id = control?.[1]; const tag = control?.[0] ?? "";
      expect(id).toBeTruthy(); expect(tag).toContain(`${id}-error`);
      expect(html).toContain(`for="${id}"`); expect(html).toContain(`id="${id}-error"`);
    }
    expect(html).toMatch(/<details[^>]*open=""/);
    expect(html).toContain("не позднее сегодняшнего дня");
  });
  it("explicitly disables both calendar triggers as well as the fieldset while keeping input", () => {
    const html = render({ disabled: true });
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect((html.match(/<button[^>]*disabled=""/g) ?? []).length).toBe(2);
    expect(html).toContain(`value="${value.documentNumber}"`); expect(html).toContain("29 октября 2026");
  });
});
