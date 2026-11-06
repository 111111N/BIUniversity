import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SearchField from ".";

describe("SearchField appearance variants", () => {
  it("renders a plain input without an icon by default", () => {
    const html = renderToStaticMarkup(<SearchField label="Поиск" value="" onChange={() => undefined} />);
    expect(html).toContain('type="search"');
    expect(html).not.toContain("<svg");
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
