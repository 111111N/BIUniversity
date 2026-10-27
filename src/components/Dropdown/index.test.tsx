import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Dropdown from ".";

describe("dropdown validation accessibility", () => {
  it.each([false, true])("associates a visible validation message with the combobox, searchable=%s", (searchable) => {
    const html = renderToStaticMarkup(<Dropdown label="Преподаватель" searchable={searchable} value="" options={[]} onChange={() => undefined} error="Выберите преподавателя" />);
    expect(html).toContain('aria-invalid="true"');
    const errorId = html.match(/id="([^"]+-error)"/)?.[1];
    expect(errorId).toBeTruthy(); expect(html).toContain(`aria-errormessage="${errorId}"`); expect(html).toContain("Выберите преподавателя");
  });
  it("keeps existing controls free of a validation error until requested", () => {
    const html = renderToStaticMarkup(<Dropdown label="Группа" value="one" options={[{ value: "one", label: "101-ИВТ" }]} onChange={() => undefined} />);
    expect(html).not.toContain('aria-invalid="true"'); expect(html).not.toContain('-error"');
    expect(html).toContain("101-ИВТ");
  });
});
