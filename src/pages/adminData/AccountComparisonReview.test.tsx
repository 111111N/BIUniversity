import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupAccountRecords } from "../../domain/backupAccountComparison";
import { coreBackupFixture } from "../../testSupport/localBackupDocuments";
import AccountComparisonReview from "./AccountComparisonReview";

const KEY = "bi-university-accounts-v1";
describe("account card comparison disclosure", () => {
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
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3"); expect(html).not.toContain("student-44");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("PRIVATE");
  });
  it("does not show an empty section or substitute built-in accounts for absent sources", async () => {
    expect(renderToStaticMarkup(<AccountComparisonReview review={await compareBackupAccountRecords([], [])} />)).toBe("");
  });
});
