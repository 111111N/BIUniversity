import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupCatalogRecords } from "../../domain/backupCatalogComparison";
import { coreBackupFixture } from "../../testSupport/localBackupDocuments";
import CatalogComparisonReview from "./CatalogComparisonReview";

describe("catalog card comparison disclosure", () => {
  it("shows histories separately and preserves collapsed details without leaking values", async () => {
    const fixture = coreBackupFixture(); fixture.groups.history = [{ id: "group-event", groupId: "group-1", actorId: "configurator-demo", occurredAt: "2026-10-28T09:00:00Z", action: "created" }]; fixture.subjects.history = [{ id: "subject-event", subjectId: "subject-1", actorId: "configurator-demo", occurredAt: "2026-10-28T09:00:00Z", action: "created" }]; fixture.save();
    const original = structuredClone(fixture.archive.localStorage); fixture.groups.history[0].actorId = "PRIVATE AUTHOR"; fixture.subjects.history[0].occurredAt = "2026-10-29T09:00:00Z"; fixture.save();
    const html = renderToStaticMarkup(<CatalogComparisonReview review={await compareBackupCatalogRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("История групп по ID событий"); expect(html).toContain("История дисциплин по ID событий"); expect(html).toContain("Изменены поля: ID автора."); expect(html).toContain("Изменены поля: дата события.");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
  });
  it("explains missing details in legacy results", async () => {
    const fixture = coreBackupFixture(); const review = await compareBackupCatalogRecords(fixture.archive.localStorage, []);
    delete review.historyComparisonVersion; delete review.groupHistory; delete review.subjectHistory;
    const html = renderToStaticMarkup(<CatalogComparisonReview review={review} />);
    expect(html).toContain("Для детализации повторите проверку архива"); expect(html).not.toContain("История групп по ID событий");
  });
  it("keeps detailed functions collapsed and identifies changed fields without exposing values", async () => {
    const fixture = coreBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    fixture.groups.groups[0].name = "PRIVATE GROUP"; fixture.groups.groups[0].campus = 2;
    fixture.subjects.subjects[0].name = "PRIVATE SUBJECT"; fixture.subjects.subjects[0].color = "purple"; fixture.save();
    const review = await compareBackupCatalogRecords(original, fixture.archive.localStorage);
    const html = renderToStaticMarkup(<CatalogComparisonReview review={review} />);
    expect(html).toContain("Карточки групп и дисциплин по ID"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
    expect(html).toContain("Изменены поля: название, корпус."); expect(html).toContain("Изменены поля: название, цвет.");
    expect(html).toContain("Совпадение карточек не означает совпадение этих документов целиком");
    expect(html).toContain('aria-label="Различия карточек групп"'); expect(html).toContain('aria-label="Различия карточек дисциплин"');
    expect(html).toContain('placeholder=""'); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Восстановить</button>");
  });
  it("makes an invalid live catalog visible in the closed summary and names the source", async () => {
    const fixture = coreBackupFixture(); const key = "bi-university-group-catalog-v1";
    const review = await compareBackupCatalogRecords(fixture.archive.localStorage, [{ key, raw: "PRIVATE{broken" }]);
    const html = renderToStaticMarkup(<CatalogComparisonReview review={review} />);
    expect(html).toContain("не сравнено 1"); expect(html).toContain("Нет каталогов групп, которые удалось сравнить");
    expect(html).toContain("Этот браузер"); expect(html).toContain("Он не считается пустым"); expect(html).not.toContain("PRIVATE");
  });
  it("paginates long catalogs and escapes technical IDs", async () => {
    const fixture = coreBackupFixture(); const subject = fixture.subjects.subjects[0];
    fixture.subjects.subjects = Array.from({ length: 45 }, (_, index) => ({ ...subject, id: index === 0 ? "<script>subject</script>" : `subject-${String(index).padStart(2, "0")}`, name: `Дисциплина ${index}`, shortName: `S${index}` })); fixture.save();
    const review = await compareBackupCatalogRecords(fixture.archive.localStorage.filter((entry) => entry.key.includes("subject-catalog")), []);
    const html = renderToStaticMarkup(<CatalogComparisonReview review={review} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("subject-44");
  });
  it("omits the section entirely if no saved catalog exists in either source", async () => {
    expect(renderToStaticMarkup(<CatalogComparisonReview review={await compareBackupCatalogRecords([], [])} />)).toBe("");
  });
});
