import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getGroupDraftErrors } from "../../domain/groupCatalog";
import GroupDetailsForm, { GroupDetailsFields } from "./GroupDetailsForm";
import GroupRefreshPanel from "./GroupRefreshPanel";

const draft = { name: "101-ИВТ", course: 1, campus: 3, admissionYear: 2026 };
describe("group details workspace", () => {
  it("links each field error to its own control, including the shared campus selector", () => {
    const invalid = { name: "", course: 0, campus: 0, admissionYear: 26 };
    const errors = Object.fromEntries(getGroupDraftErrors(invalid).map((error) => [error.field, error.message]));
    const html = renderToStaticMarkup(<GroupDetailsFields draft={invalid} errors={errors} disabled={false} onChange={() => undefined} onBlur={() => undefined} />);
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(4);
    expect(html).toContain("Название группы: от 2 до 80 символов."); expect(html).toContain("Выберите один из девяти");
    expect(html).toMatch(/aria-describedby="[^"]+-name-error"/); expect(html).toMatch(/aria-errormessage="[^"]+-error"/);
  });
  it("lets an incomplete creation form be submitted for field validation and keeps stale saves unavailable", () => {
    const render = (stale: boolean) => renderToStaticMarkup(<GroupDetailsForm draft={{ ...draft, name: "", campus: 0 }} editing={false} dirty={false} disabled={false} stale={stale} busy={false} formRef={createRef()} onChange={() => undefined} onSubmit={() => undefined} onCancel={() => undefined} />);
    expect(render(false)).toContain("noValidate");
    expect(render(false)).toMatch(/<button(?![^>]*disabled)[^>]*type="submit"[^>]*>Создать группу/);
    expect(render(true)).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(render(true)).toContain("Сначала обновите проверку");
  });
  it("shows both versions and prevents choosing a comparison that has become stale", () => {
    const review = { groupId: "g1", groupRevision: 2, revision: 2, actorId: "admin", actorRevision: 1, latest: { ...draft, name: "Другая группа", status: "archived" as const } };
    const html = renderToStaticMarkup(<GroupRefreshPanel draft={draft} review={review} stale disabled={false} onRefresh={() => undefined} onChoose={() => undefined} />);
    expect(html).toContain("101-ИВТ"); expect(html).toContain("Другая группа"); expect(html).toContain("В архиве");
    expect(html).toContain("сохранение выполняется отдельно");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Продолжить с моими реквизитами/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Обновить сравнение/);
  });
});
