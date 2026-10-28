import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentReview from "./DocumentReview";
import { inspectBackupDocuments, type BackupDocumentReview } from "../../domain/localBackupDocuments";
import { coreBackupFixture } from "../../testSupport/localBackupDocuments";

describe("archive document review presentation", () => {
  it("lists the four actual schemas without claiming recovery or complete validation", async () => {
    const review = await inspectBackupDocuments(coreBackupFixture().archive, "configurator-demo"); const html = renderToStaticMarkup(<DocumentReview review={review} />);
    for (const text of ["Учётные записи", "Группы", "Дисциплины", "Расписание", "Схема прочитана", "ревизия 1", "Отсутствие замечаний здесь не означает"]) expect(html).toContain(text);
    expect(html).not.toContain("Готов к восстановлению"); expect(html).not.toContain("Восстановить</button>");
  });
  it("keeps invalid source reasons and unverified dependencies visible, exposing no raw document contents", async () => {
    const fixture = coreBackupFixture(); fixture.archive.localStorage[0].raw = '{"secret":"private-data"BROKEN';
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Не читается"); expect(html).toContain("Некорректный JSON внутри документа"); expect(html).toContain("Ошибки в данных: 1"); expect(html).toContain("Замечания к документам"); expect(html).not.toContain("private-data");
  });
  it("paginates issues, discloses capped results and escapes reference IDs", () => {
    const review: BackupDocumentReview = { checks: [], counts: { valid: 4, invalid: 0, absent: 0, unchecked: 11, errors: 230, reviews: 0, hiddenIssues: 30 }, issues: Array.from({ length: 200 }, (_, index) => ({ level: "error", kind: "accounts", code: "missing-group", referenceId: index === 0 ? "<script>bad()</script>" : `id-${index}`, message: "Связь недоступна" })) };
    const html = renderToStaticMarkup(<DocumentReview review={review} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(10); expect(html).toContain("Страница 1 из 20"); expect(html).toContain("Ещё 30 учтены"); expect(html).toContain("Другие локальные записи: 11"); expect(html).not.toContain("id-10");
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  });
});
