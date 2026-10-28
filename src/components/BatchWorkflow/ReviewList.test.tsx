import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchActionBar } from ".";
import BatchReviewList from "./ReviewList";

const noop = () => undefined;
const render = (patch = {}) => renderToStaticMarkup(<BatchReviewList searchLabel="Поиск строки импорта" query="" total={41} page={1} pageSize={20} onQuery={noop} onPage={noop} onReset={noop} {...patch}><ol aria-label="Проверенный список"><li>Студент</li></ol></BatchReviewList>);
describe("long batch review navigation", () => {
  it("labels a blank search and exposes separate navigation above and below the rows", () => {
    const html = render();
    expect(html).toContain("Поиск строки импорта"); expect(html).toContain('placeholder=""');
    expect(html).toContain("Показано: 1–20 из 41"); expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Страницы проверенного списка · сверху"'); expect(html).toContain('aria-label="Страницы проверенного списка · снизу"');
    expect((html.match(/disabled=""[^>]*>Назад/g) ?? []).length).toBe(2);
    expect(html).not.toContain('type="submit"');
  });
  it("clamps the last page and disables moving past it at both ends of the list", () => {
    const html = render({ page: 99 }); expect(html).toContain("Показано: 41–41 из 41");
    expect((html.match(/disabled=""[^>]*>Далее/g) ?? []).length).toBe(2);
  });
  it("offers a filter reset instead of an empty list and keeps the entered search visible", () => {
    const html = render({ total: 0, query: "Несуществующий студент" });
    expect(html).toContain('value="Несуществующий студент"'); expect(html).toContain("Сбросить поиск и фильтр");
    expect(html).toContain("Показано: 0–0 из 0"); expect(html).not.toContain('aria-label="Проверенный список"'); expect(html).not.toContain("Страницы проверенного списка");
  });
  it("avoids pagination on a short result and offers return to the single apply area only for previews", () => {
    expect(render({ total: 3 })).not.toContain("Страницы проверенного списка");
    expect(render({ total: 3 })).not.toContain("К действиям со списком");
    expect(render({ total: 3, actionsRef: { current: null } })).toContain("К действиям со списком");
  });
  it("keeps the application block focusable and does not hide the reason a write is disabled", () => {
    const html = renderToStaticMarkup(<BatchActionBar title="Будет изменено: 12 из 15" hint="Исправьте строки с ошибками: 3." label="Применить" disabled onApply={noop}><button type="button">К параметрам</button></BatchActionBar>);
    expect(html).toMatch(/<section[^>]*tabindex="-1"[^>]*aria-label="Применение проверенного списка"/);
    expect(html).toContain("Исправьте строки с ошибками: 3."); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Применить/);
    expect(html).toContain("К параметрам");
  });
});
