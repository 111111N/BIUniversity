import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AdministrationReturnNotice from ".";
import { createChecksReturn, withChecksReturn } from "../../domain/administrationChecksNavigation";

const render = (href: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[href]}><AdministrationReturnNotice /></MemoryRouter>);
describe("contextual return to data checks", () => {
  it("shows one explicit return action with the report's original filters and page", () => {
    const back = createChecksReturn("?kind=student-number&level=action", 2, "number:one");
    const html = render(withChecksReturn("/admin/accounts?account=one&mode=education", back));
    expect(html).toContain("Открыто из проверки данных"); expect(html).toContain("Вернуться к результатам");
    expect(html).toContain("kind=student-number&amp;level=action&amp;page=2"); expect(html).toContain("#admin-check-number%3Aone");
  });
  it("does not clutter ordinary editing screens or expose an external destination", () => {
    expect(render("/admin/accounts?account=one")).toBe("");
    expect(render("/admin/groups?checksReturn=https%3A%2F%2Fexample.test")).toBe("");
    expect(render("/admin/checks?checksReturn=%2Fadmin%2Fchecks")).toBe("");
  });
});
