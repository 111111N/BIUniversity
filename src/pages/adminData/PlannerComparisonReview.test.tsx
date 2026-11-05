import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupPlannerRecords } from "../../domain/backupPlannerComparison";
import { getPlannerStorageKey } from "../../domain/plannerStorage";
import PlannerComparisonReview from "./PlannerComparisonReview";

const task = (id = "task-1") => ({ id, title: "PRIVATE TITLE", text: "PRIVATE TEXT", createdAt: "2026-11-02T00:00Z" });
const entry = (rows: unknown[]) => ({ key: getPlannerStorageKey("student-1"), raw: JSON.stringify(rows) });
describe("planner entity comparison disclosure", () => {
  it("keeps the extra review collapsed, names changed fields and omits task contents and restore controls", async () => {
    const review = await compareBackupPlannerRecords([entry([task()])], [entry([{ ...task(), title: "PRIVATE DIFFERENT", endAt: "2026-11-04T10:00Z" }])]);
    const html = renderToStaticMarkup(<PlannerComparisonReview review={review} />);
    expect(html).toContain("Задачи планировщика по ID"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
    expect(html).toContain("Изменены поля: название, окончание."); expect(html).toContain("Задачи отличаются");
    expect(html).toContain('aria-label="Различия задач планировщика"'); expect(html).toContain('placeholder=""');
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Восстановить</button>"); expect(html).not.toContain("Выбрать версию</button>");
  });
  it("surfaces a failed browser comparison without a false empty or matching result", async () => {
    const review = await compareBackupPlannerRecords([entry([task()])], [{ ...entry([]), raw: "PRIVATE{broken" }]);
    const html = renderToStaticMarkup(<PlannerComparisonReview review={review} />);
    expect(html).toContain("не сравнено 1"); expect(html).toContain("Нет списков, которые удалось сравнить");
    expect(html).toContain("Этот браузер"); expect(html).toContain("Он не считается пустым");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("различий задач не найдено");
  });
  it("limits the rendered task list to one page and escapes IDs", async () => {
    const rows = Array.from({ length: 45 }, (_, index) => task(index === 0 ? "<script>task</script>" : `task-${String(index).padStart(2, "0")}`));
    const review = await compareBackupPlannerRecords([entry(rows)], []);
    const html = renderToStaticMarkup(<PlannerComparisonReview review={review} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("task-44");
  });
  it("does not add an empty section when neither source contains planner lists", async () => {
    expect(renderToStaticMarkup(<PlannerComparisonReview review={await compareBackupPlannerRecords([], [])} />)).toBe("");
  });
});
