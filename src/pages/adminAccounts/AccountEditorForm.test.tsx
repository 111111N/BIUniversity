import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AccountEditorForm from "./AccountEditorForm";
import type { AccountDraft } from "../../domain/accounts";

const draft: AccountDraft = { name: "", login: "", email: "broken", role: "student", memberships: [] };
describe("account form initial presentation", () => {
  it("starts quietly, uses the shared field labels and keeps additional actions in the same form", () => {
    const html = renderToStaticMarkup(<AccountEditorForm mode="create" draft={draft} accounts={[]} groups={[]} disabled={false} stale={false} onChange={() => {}} onSubmit={() => {}}><button type="submit">Создать учётную запись</button></AccountEditorForm>);
    expect(html).toContain('aria-label="Новая учётная запись" noValidate=""');
    expect(html).not.toContain("Проверьте отмеченные поля");
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toContain("Создать учётную запись</button></form>");
  });
  it("keeps source values while the data source is unavailable", () => {
    const html = renderToStaticMarkup(<AccountEditorForm mode="details" draft={{ ...draft, name: "Мои изменения", login: "my.changes" }} accounts={[]} groups={[]} disabled stale onChange={() => {}} onSubmit={() => {}}>Источник недоступен</AccountEditorForm>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('value="Мои изменения"'); expect(html).toContain('value="my.changes"');
    expect(html).not.toContain("Этот логин уже занят");
  });
});
