import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupAccountRecords } from "../../domain/backupAccountComparison";
import { coreBackupFixture, studentOperationBackupFixture } from "../../testSupport/localBackupDocuments";
import AccountComparisonReview from "./AccountComparisonReview";

const KEY = "bi-university-accounts-v1";
describe("account card comparison disclosure", () => {
  it("shows education differences without document numbers or grounds", async () => {
    const fixture = studentOperationBackupFixture(undefined, { effectiveDate: "2026-10-28", basis: "PRIVATE BASIS", documentNumber: "PRIVATE NUMBER" }); const original = structuredClone(fixture.archive.localStorage);
    fixture.accounts.educationEvents![0].basis = "PRIVATE NEW BASIS"; fixture.accounts.studentOperations![0].education!.basis = "PRIVATE NEW BASIS"; fixture.save();
    const html = renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("События обучения по ID"); expect(html).toContain("Изменены поля: основание."); expect(html).not.toContain("PRIVATE"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
  });
  it("reports a missing legacy education source instead of asserting empty history", async () => {
    const fixture = coreBackupFixture(); const html = renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords(fixture.archive.localStorage, [])} />);
    expect(html).toContain("В старом документе не сохранён источник событий обучения"); expect(html).toContain("Нет сравнимых источников событий обучения"); expect(html).not.toContain("В сравнимых документах различий событий обучения не найдено");
  });
  it("shows audit field differences in a collapsed separate section without their values", async () => {
    const fixture = coreBackupFixture(); fixture.accounts.history = [{ id: "audit-1", actorId: "configurator-demo", accountId: "student-1", occurredAt: "2026-10-28T09:00:00Z", action: "details-changed", previousRole: "student", nextRole: "student", changes: [{ field: "email", before: "PRIVATE BEFORE", after: "PRIVATE AFTER" }] }]; fixture.save();
    const original = structuredClone(fixture.archive.localStorage); fixture.accounts.history[0].occurredAt = "2026-10-29T09:00:00Z"; fixture.accounts.history[0].changes![0].after = "PRIVATE LATEST"; fixture.save();
    const html = renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("История учёток по ID событий"); expect(html).toContain("Изменены поля: дата события, изменённые реквизиты.");
    expect(html).toContain('aria-label="Различия событий истории учёток"'); expect(html).not.toMatch(/<details[^>]*\bopen=/);
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("2026-10-29"); expect(html).not.toContain("Откатить</button>");
  });
  it("asks to rerun an old result without fabricating empty history", async () => {
    const fixture = coreBackupFixture(); const review = await compareBackupAccountRecords(fixture.archive.localStorage, []);
    delete review.history; delete review.historyComparisonVersion;
    const html = renderToStaticMarkup(<AccountComparisonReview review={review} />);
    expect(html).toContain("Для детализации повторите проверку архива"); expect(html).not.toContain("История учёток по ID событий");
  });
  it("paginates long audit lists separately from account cards and escapes event IDs", async () => {
    const fixture = coreBackupFixture(); fixture.accounts.history = Array.from({ length: 45 }, (_, index) => ({ id: index === 0 ? "<script>audit</script>" : `audit-${String(index).padStart(2, "0")}`, actorId: "configurator-demo", accountId: "student-1", occurredAt: "2026-10-28T09:00:00Z", action: "details-changed", previousRole: "student", nextRole: "student", changes: [{ field: "name", before: "PRIVATE BEFORE", after: "PRIVATE AFTER" }] })); fixture.save();
    const html = renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords(fixture.archive.localStorage, [])} />);
    const list = html.match(/<ul[^>]*aria-label="Различия событий истории учёток"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
    expect(list).toBeDefined(); expect((list!.match(/<li>/g) ?? []).length).toBe(20);
    expect(html).toContain("Страница 1 из 3"); expect(list).not.toContain("audit-44"); expect(html).toContain("&lt;script&gt;audit&lt;/script&gt;"); expect(html).not.toContain("PRIVATE");
  });
  it("shows changed field names in a collapsed section without exposing personal data or applying roles", async () => {
    const fixture = coreBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.accounts.accounts[2], { name: "PRIVATE NAME", login: "private.student", email: "private@example.invalid", status: "blocked", studentRecord: { number: "202630012", year: 2026, campus: 3, sequence: 12, issuedAt: "2026-11-02T00:00Z" } }); fixture.save();
    const review = await compareBackupAccountRecords(original, fixture.archive.localStorage);
    const html = renderToStaticMarkup(<AccountComparisonReview review={review} />);
    expect(html).toContain("Учётные записи по ID"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
    expect(html).toContain("Изменены поля: ФИО, логин, доступ ко входу, почта, реквизиты зачётки.");
    expect(html).toContain("Совпадение карточек не подтверждает право входа"); expect(html).toContain('aria-label="Различия карточек учётных записей"');
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("private.student"); expect(html).not.toContain("private@example.invalid"); expect(html).not.toContain("202630012");
    expect(html).not.toContain("Восстановить</button>"); expect(html).not.toContain("Сменить тип</button>");
  });
  it("surfaces unsupported sources without a false empty account list", async () => {
    const review = await compareBackupAccountRecords([], [{ key: KEY, raw: "PRIVATE{broken" }]);
    const html = renderToStaticMarkup(<AccountComparisonReview review={review} />);
    expect(html).toContain("не сравнено 1"); expect(html).toContain("Нет документов учёток, которые удалось сравнить");
    expect(html).toContain("Этот браузер"); expect(html).toContain("Он не считается пустым"); expect(html).not.toContain("PRIVATE");
  });
  it("limits long lists to a page and escapes technical IDs", async () => {
    const fixture = coreBackupFixture(); const student = fixture.accounts.accounts[2];
    fixture.accounts.accounts = [fixture.accounts.accounts[0], ...Array.from({ length: 45 }, (_, index) => ({ ...student, id: index === 0 ? "<script>student</script>" : `student-${String(index).padStart(2, "0")}`, name: `PRIVATE ${index}`, login: `private.student.${index}` }))]; fixture.save();
    const html = renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords(fixture.archive.localStorage, [])} />);
    const list = html.match(/<ul[^>]*aria-label="Различия карточек учётных записей"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
    expect((list?.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3"); expect(html).not.toContain("student-44");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("PRIVATE");
  });
  it("does not show an empty section or substitute built-in accounts for absent sources", async () => {
    expect(renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords([], [])} />)).toBe("");
  });
});
