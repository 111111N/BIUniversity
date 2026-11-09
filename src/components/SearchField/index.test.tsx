import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SearchField from ".";

describe("SearchField appearance variants", () => {
  it("renders a plain input without an icon by default", () => {
    const html = renderToStaticMarkup(<SearchField label="Поиск" value="" onChange={() => undefined} />);
    expect(html).toContain('type="search"');
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("enterKeyHint");
    expect(html).not.toContain('aria-label="Найти"');
  });

  it("supports an explicit search action while retaining an accessible hidden label", () => {
    const html = renderToStaticMarkup(<SearchField hideLabel label="Аудитория" value="424/1" placeholder="" onChange={() => undefined} onSearch={() => undefined} searchButtonLabel="Найти расписание" />);
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toMatch(new RegExp(`<label[^>]*for="${inputId}"[^>]*>Аудитория</label>`));
    expect(html).toContain('enterKeyHint="search"');
    expect(html).toContain('aria-label="Найти расписание"');
    expect(html).toContain('aria-label="Очистить: Аудитория"');
    expect(html).not.toContain("<form");
  });

  it("renders a decorative magnifier beside the input when requested", () => {
    const html = renderToStaticMarkup(<SearchField withIcon label="Группа" value="101" onChange={() => undefined} />);
    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).toContain('value="101"');
    expect(html).toContain('aria-label="Очистить: Группа"');
  });

  it("connects validation feedback to the input", () => {
    const html = renderToStaticMarkup(<SearchField label="Группа" value="" error="Введите запрос" onChange={() => undefined} />);
    expect(html).toContain('aria-invalid="true"');
    const errorId = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(errorId).toBeTruthy();
    expect(html).toContain(`id="${errorId}"`);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Введите запрос");
  });
});
