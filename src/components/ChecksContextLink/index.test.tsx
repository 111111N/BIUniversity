import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ChecksContextLink from ".";
import { CHECKS_RETURN_PARAM, createChecksReturn, withChecksReturn } from "../../domain/administrationChecksNavigation";

const back = createChecksReturn("?kind=empty-group", 2, "group:one");
const render = (href: string, source = withChecksReturn("/admin/groups?group=one", back)) => renderToStaticMarkup(<MemoryRouter initialEntries={[source]}><ChecksContextLink to={href} className="action" aria-label="Добавить студента">Создать</ChecksContextLink></MemoryRouter>);
describe("links within a corrective task", () => {
  it("preserves return context and regular link attributes when continuing to import", () => {
    const html = render("/admin/accounts/import?group=one&from=group");
    const href = /href="([^"]+)"/.exec(html)![1].replaceAll("&amp;", "&");
    const target = new URL(href, "https://portal.invalid");
    expect(target.pathname).toBe("/admin/accounts/import"); expect(target.searchParams.get(CHECKS_RETURN_PARAM)).toBe(back);
    expect(html).toContain('class="action"'); expect(html).toContain('aria-label="Добавить студента"');
  });
  it("keeps unrelated and ordinary links unchanged", () => {
    expect(render("/admin/teachers")).toContain('href="/admin/teachers"');
    expect(render("/admin/accounts?create=student", "/admin/groups?group=one")).not.toContain(CHECKS_RETURN_PARAM);
  });
});
