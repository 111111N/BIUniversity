import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getSubjectDraftErrors } from "../../domain/subjectCatalog";
import SubjectCreationForm, { SubjectCreationFields } from "./SubjectCreationForm";

const draft = { name: "Новая дисциплина", shortName: "НД" };
const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<SubjectCreationForm draft={draft} subjects={[]} disabled={false} stale={false} busy={false} formRef={createRef()} onChange={noop} onSubmit={noop} onCancel={noop} {...patch} />);

describe("subject creation fields", () => {
  it("links each required field, hint and error to the correct control", () => {
    const invalid = { name: " ", shortName: " " };
    const errors = Object.fromEntries(getSubjectDraftErrors(invalid, []).map((error) => [error.field, error.message]));
    const html = renderToStaticMarkup(<SubjectCreationFields draft={invalid} errors={errors} disabled={false} onChange={noop} onBlur={noop} />);
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(2);
    for (const name of ["name", "shortName"]) {
      const input = html.match(new RegExp(`<input[^>]* name="${name}"[^>]*>`))?.[0] ?? "";
      const id = input.match(/ id="([^"]+)"/)?.[1];
      expect(id).toBeTruthy(); expect(input).toContain(`aria-describedby="${id}-hint ${id}-error"`);
      expect(html).toContain(`for="${id}"`); expect(html).toContain(`id="${id}-hint"`); expect(html).toContain(`id="${id}-error"`);
    }
    expect((html.match(/\(обязательно\)/g) ?? []).length).toBe(2);
    expect(html).toContain("компактных карточках"); expect(html).not.toContain("placeholder=");
  });
  it("starts quietly and permits submitting an incomplete form to see field errors", () => {
    const html = render({ draft: { name: "", shortName: "" } });
    expect(html).toContain('aria-label="Новая дисциплина" noValidate=""');
    expect(html).not.toContain('aria-invalid="true"'); expect(html).not.toContain("Проверьте отмеченные поля");
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*type="submit"[^>]*>Создать дисциплину/);
  });
  it("keeps the entered values when stale or unavailable and explains why creation is blocked", () => {
    const stale = render({ stale: true }); const unavailable = render({ disabled: true });
    for (const html of [stale, unavailable]) {
      expect(html).toContain('value="Новая дисциплина"'); expect(html).toContain('value="НД"');
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    }
    expect(stale).toContain("обновите проверку каталога"); expect(stale).not.toMatch(/<fieldset[^>]*disabled/);
    expect(unavailable).toContain("Повторить чтение"); expect(unavailable).toMatch(/<fieldset[^>]*disabled/);
  });
  it("disables changes and cancellation while the explicit creation is pending", () => {
    const html = render({ busy: true });
    expect(html).toMatch(/<fieldset[^>]*disabled/); expect(html).toContain("Создаём…");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Отмена/);
  });
});
