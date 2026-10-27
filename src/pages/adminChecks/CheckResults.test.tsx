import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AdministrationChecksResult, AdministrationIssue } from "../../domain/administrationChecks";
import CheckResults from "./CheckResults";

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
});
