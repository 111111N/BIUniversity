import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdministrationChecksResult, AdministrationIssue } from "../../domain/administrationChecks";
import CheckResults from "./CheckResults";
import { CHECKS_RETURN_PARAM, readCheckResultAnchor } from "../../domain/administrationChecksNavigation";

const snapshot = (rows: AdministrationIssue[] = []): AdministrationChecksResult => ({ rows, total: rows.length, page: 1, pages: 1, checkedAt: "2026-10-27T09:00:00Z", counts: { action: rows.length, review: 0 }, kinds: { "empty-group": 0, "unassigned-subject": 0, "student-number": 0, "published-lesson": 0 } });
const render = (result: AdministrationChecksResult | null, error = "", loading = false, filtered = false) => renderToStaticMarkup(<MemoryRouter><CheckResults snapshot={result} error={error} loading={loading} filtered={filtered} onPage={() => {}} /></MemoryRouter>);

describe("data check result safety and corrective navigation", () => {
  it("does not show old rows or a false clean result during an error or a new request", () => {
    const stale = snapshot([{ id: "old", kind: "empty-group", level: "review", groupId: "old", title: "Старая строка", detail: "Данные предыдущего запроса" }]);
    const failed = render(stale, "Источник недоступен");
    expect(failed).toContain('role="alert"'); expect(failed).toContain("Источник недоступен"); expect(failed).not.toContain("Старая строка"); expect(failed).not.toContain("замечаний нет");
    const loading = render(stale, "", true);
    expect(loading).toContain('aria-busy="true"'); expect(loading).not.toContain("Старая строка"); expect(loading).not.toContain("замечаний нет");
  });
  it("distinguishes a filtered empty list from a completed check without promising system-wide correctness", () => {
    expect(render(snapshot(), "", false, true)).toContain("По этим условиям записей нет");
    expect(render(snapshot())).toContain("По выполненным проверкам замечаний нет");
    expect(render(snapshot())).toContain("Расписание перед публикацией проверяется отдельно");
  });
  it("opens the exact account, subject or schedule scope and retains the teacher as a secondary destination", () => {
    const html = render(snapshot([
      { id: "number", kind: "student-number", level: "action", title: "Иванов", detail: "Нет зачетки", accountId: "student & one" },
      { id: "subject", kind: "unassigned-subject", level: "review", title: "Предмет", detail: "Нет назначений", subjectId: "math & one" },
      { id: "lesson", kind: "published-lesson", level: "action", title: "Пара", detail: "Нет назначения", groupId: "group & one", weekStart: "2026-10-26", accountId: "teacher & one" },
    ]));
    expect(html).toContain('/admin/accounts?account=student%20%26%20one&amp;mode=education');
    expect(html).toContain('/admin/subjects?subject=math%20%26%20one');
    expect(html).toContain('/admin/schedule?group=group%20%26%20one&amp;date=2026-10-26');
    expect(html).toContain('/admin/accounts?account=teacher%20%26%20one');
  });
  it("routes archived or absent groups to the catalog rather than opening another schedule group", () => {
    const html = render(snapshot([
      { id: "archived", kind: "published-lesson", level: "action", title: "Архив", detail: "Группа в архиве", groupId: "archived", groupArchived: true },
      { id: "missing", kind: "published-lesson", level: "action", title: "Нет группы", detail: "Группа недоступна" },
    ]));
    expect(html).toContain('/admin/groups?group=archived'); expect(html).toContain('href="/admin/groups"'); expect(html).not.toContain('/admin/schedule');
  });
  it("preserves report context for primary and secondary corrective actions without changing the exact records", () => {
    const result = snapshot([{ id: "lesson:one", kind: "published-lesson", level: "action", title: "Пара", detail: "Нет назначения", groupId: "group & one", weekStart: "2026-10-26", accountId: "teacher & one" }]);
    result.page = 2; result.pages = 2; result.total = 21;
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/admin/checks?q=Иванов&kind=published-lesson&level=action&page=2"]}><CheckResults snapshot={result} error="" loading={false} filtered onPage={() => undefined} /></MemoryRouter>);
    const targets = [...html.matchAll(/href="([^"]+)"/g)].map((entry) => new URL(entry[1].replaceAll("&amp;", "&"), "https://portal.invalid"));
    expect(targets).toHaveLength(2);
    expect(targets[0].searchParams.get("group")).toBe("group & one"); expect(targets[0].searchParams.get("date")).toBe("2026-10-26");
    expect(targets[1].searchParams.get("account")).toBe("teacher & one");
    for (const target of targets) {
      const back = new URL(target.searchParams.get(CHECKS_RETURN_PARAM)!, "https://portal.invalid");
      expect(back.pathname).toBe("/admin/checks"); expect(back.searchParams.get("q")).toBe("Иванов"); expect(back.searchParams.get("page")).toBe("2");
      expect(readCheckResultAnchor(back.hash)).toBe("admin-check-lesson:one");
    }
  });
  it("does not claim that an issue is fixed merely because it is absent from the returned page", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/admin/checks#admin-check-missing"]}><CheckResults snapshot={snapshot()} error="" loading={false} filtered onPage={() => undefined} /></MemoryRouter>);
    expect(html).toContain("Ранее открытое замечание сейчас не показано на этой странице"); expect(html).not.toContain("Замечание исправлено");
  });
});
