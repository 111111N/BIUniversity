import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import UncheckedStorageKeys from "./UncheckedStorageKeys";
import DocumentReview from "./DocumentReview";
import { inspectBackupDocuments } from "../../domain/localBackupDocuments";
import { coreBackupFixture } from "../../testSupport/localBackupDocuments";

describe("unreviewed archive key presentation", () => {
  it("starts collapsed with labelled search and a small page instead of a wall of keys", () => {
    const keys = Array.from({ length: 205 }, (_, index) => `bi-university-extra:${index}`);
    const html = renderToStaticMarkup(<UncheckedStorageKeys keys={keys} total={205} />);
    expect(html).toContain("Непроверенные локальные ключи (205)");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|>)/);
    expect(html).toContain("Найти непроверенный ключ"); expect(html).toContain('placeholder=""');
    expect(html).toContain("Найдено ключей: 205 из 205"); expect(html).toContain("Страница 1 из 21");
    expect((html.match(/<li>/g) ?? []).length).toBe(10); expect(html).not.toContain("extra:204");
    expect(html).toContain('tabindex="-1"'); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Назад/);
  });
  it("integrates the actual unknown-key inventory without exposing raw values", async () => {
    const fixture = coreBackupFixture();
    fixture.archive.localStorage.push({ key: "bi-university-<script>alert(1)</script>", raw: "PRIVATE secret content" });
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Другие локальные записи: 1"); expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("PRIVATE");
    expect(html).toContain("они не исключены из исходного архива");
  });
  it("asks for a fresh inspection when only an old count or a partial inventory is available", () => {
    for (const keys of [undefined, ["bi-university-extra"]]) {
      const html = renderToStaticMarkup(<UncheckedStorageKeys keys={keys} total={2} />);
      expect(html).toContain("Перечень непроверенных ключей не сохранён полностью");
      expect(html).not.toContain('type="search"'); expect(html).not.toContain("Найдено ключей: 0");
    }
  });
  it("does not add controls when all key families were reviewed", () => {
    expect(renderToStaticMarkup(<UncheckedStorageKeys keys={[]} total={0} />)).toBe("");
  });
});
