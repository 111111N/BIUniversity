import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ImportRowEditor from "./ImportRowEditor";

const initial = { name: "Новый Студент", login: "bad", group: "Неизвестная", campus: "10", email: "broken" };
const props = { line: 17, initial, mapping: { name: 0, login: 1, group: 2, campus: 3, email: 4 }, groups: [{ id: "active", name: "112-МКо", campus: 3 }, { id: "archive", name: "Архив", status: "archived" as const }], defaultGroup: "112-МКо", defaultCampus: null, errors: ["Группа не найдена.", "Проверьте логин."], busy: false, disabled: false, error: "", onClose: () => {}, onReview: () => {} };

describe("focused import row editor", () => {
  it("shows the exact row, source values and original issues without exposing account creation", () => {
    const html = renderToStaticMarkup(<ImportRowEditor {...props} />);
    for (const text of ["Исправление строки 17", "Группа не найдена.", "Проверьте логин.", "Неизвестная", "10 · проверьте корпус", "Проверить исправление", "Новый Студент", "Номера зачеток"]) expect(html.toLowerCase()).toContain(text.toLowerCase());
    expect(html).not.toContain("Создать студентов");
    expect(html).toContain('aria-label="Группа" role="combobox"');
  });
  it("exposes common values as read-only when their columns are unmapped", () => {
    const html = renderToStaticMarkup(<ImportRowEditor {...props} initial={{ ...initial, group: "", campus: "", email: "" }} mapping={{ ...props.mapping, group: -1, campus: -1, email: -1 }} />);
    expect(html).toContain("Из общих настроек списка");
    expect(html).toContain("Из общих настроек или группы");
    expect(html).toContain("112-МКо"); expect(html).not.toContain("Электронная почта");
  });
  it("disables submission on unavailable data but leaves cancellation available", () => {
    const html = renderToStaticMarkup(<ImportRowEditor {...props} disabled error="Источник недоступен" />);
    expect(html).toContain('role="alert">Источник недоступен');
    expect(html).toMatch(/type="submit" disabled=""/);
    expect(html).toMatch(/type="button">Отмена/);
  });
  it("describes a pending preview as a check and does not imply saving accounts", () => {
    const html = renderToStaticMarkup(<ImportRowEditor {...props} busy disabled />);
    expect(html).toContain("Проверяем…"); expect(html).not.toContain("Сохраняем…");
  });
});
