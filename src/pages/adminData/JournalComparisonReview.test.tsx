import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupJournalRecords } from "../../domain/backupJournalComparison";
import { journalBackupFixture } from "../../testSupport/localBackupDocuments";
import JournalComparisonReview from "./JournalComparisonReview";

describe("journal history comparison disclosure", () => {
  it("shows changed field labels without marks or personal contents", async () => {
    const state = journalBackupFixture(); const original = structuredClone(state.archive.localStorage); state.changes[0].nextValue = "sick"; state.save();
    const html = renderToStaticMarkup(<JournalComparisonReview review={await compareBackupJournalRecords(original, state.archive.localStorage)} />);
    expect(html).toContain("История журналов по ID событий"); expect(html).toContain("Изменены поля: новое значение."); expect(html).not.toContain("PRIVATE"); expect(html).not.toMatch(/<details[^>]*\bopen=/); expect(html).not.toContain("Восстановить</button>");
  });
  it("explains unresolved source areas without a misleading empty history", async () => {
    const state = journalBackupFixture(); const entries = state.archive.localStorage.filter(row => !row.key.includes("-catalog-"));
    const html = renderToStaticMarkup(<JournalComparisonReview review={await compareBackupJournalRecords(entries, [])} />);
    expect(html).toContain("Учебная область истории не подтверждена"); expect(html).toContain("Нет сравнимых источников истории журнала"); expect(html).not.toContain("В сравнимых источниках различий событий журнала не найдено");
  });
  it("limits event lists to a page and escapes persisted IDs", async () => {
    const state = journalBackupFixture(); const row = state.changes[0]; state.changes.splice(0, 1, ...Array.from({ length: 45 }, (_, i) => ({ ...row, id: i ? `event-${String(i).padStart(2, "0")}` : "<script>event</script>" }))); state.save();
    const html = renderToStaticMarkup(<JournalComparisonReview review={await compareBackupJournalRecords(state.archive.localStorage, [])} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3"); expect(html).not.toContain("event-44"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("PRIVATE");
  });
});
