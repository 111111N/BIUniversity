import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupLearningRecords } from "../../domain/backupLearningComparison";
import { learningBackupFixture } from "../../testSupport/localBackupDocuments";
import LearningComparisonReview from "./LearningComparisonReview";

describe("assignment and submission comparison disclosure", () => {
  it("shows field names in closed sections without conditions, answers, attempt contents or file names", async () => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    Object.assign(fixture.assignments[0], { description: "PRIVATE NEW CONDITION", deadline: "2026-11-05T18:00Z", attachmentName: "PRIVATE.pdf" });
    Object.assign(fixture.submissions[0].attempts![0], { PRIVATE_EXTENSION: "PRIVATE ATTEMPT VALUE" }); fixture.save();
    const html = renderToStaticMarkup(<LearningComparisonReview review={await compareBackupLearningRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("Задания и ответы по ID"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
    expect(html).toContain("Изменены поля: условие, срок сдачи, имя вложения."); expect(html).toContain("Изменены поля: история попыток.");
    expect(html).toContain('aria-label="Различия заданий"'); expect(html).toContain('aria-label="Различия карточек ответов"'); expect(html).toContain('placeholder=""');
    expect(html).not.toContain("PRIVATE"); expect(html).toContain('aria-label="Различия попыток ответов"'); expect(html).not.toContain("Восстановить</button>");
  });
  it("surfaces a contradictory live answer without displaying it as missing", async () => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    fixture.submissions[0].text = "PRIVATE CONFLICT"; fixture.save();
    const html = renderToStaticMarkup(<LearningComparisonReview review={await compareBackupLearningRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("не сравнено 1"); expect(html).toContain("Нет списков ответов, которые удалось сравнить");
    expect(html).toContain("содержит противоречия"); expect(html).toContain("Этот браузер"); expect(html).not.toContain("PRIVATE");
  });
  it("limits long answer lists to a page and escapes technical IDs", async () => {
    const fixture = learningBackupFixture(); const row = fixture.submissions[0];
    fixture.submissions.splice(0, 1, ...Array.from({ length: 45 }, (_, index) => ({ ...row, id: index === 0 ? "<script>answer</script>" : `answer-${String(index).padStart(2, "0")}` }))); fixture.save();
    const entries = fixture.archive.localStorage.filter((entry) => entry.key === "bi-university-demo-submissions");
    const html = renderToStaticMarkup(<LearningComparisonReview review={await compareBackupLearningRecords(entries, [])} />);
    const lists = [...html.matchAll(/<ul[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/ul>/g)];
    expect(lists.map((match) => match[1])).toEqual(["Различия карточек ответов", "Различия попыток ответов"]);
    for (const list of lists) { expect((list[2].match(/<li>/g) ?? []).length).toBe(20); expect(list[2]).not.toContain("answer-44"); }
    expect(html).toContain("Страница 1 из 3");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("PRIVATE");
  });
  it("does not show a new section for absent saved lists", async () => {
    expect(renderToStaticMarkup(<LearningComparisonReview review={await compareBackupLearningRecords([], [])} />)).toBe("");
  });
  it("shows missing legacy histories separately while keeping comparable parent cards available", async () => {
    const fixture = learningBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    fixture.submissions[0].attempts = undefined; fixture.save();
    const review = await compareBackupLearningRecords(original, fixture.archive.localStorage);
    const html = renderToStaticMarkup(<LearningComparisonReview review={review} />);
    expect(review.submissions.counts.comparedDocuments).toBe(1); expect(html).toContain("История попыток отсутствует или пуста");
    expect(html).toContain("не сравнено 1"); expect(html).not.toContain("не сравнено 2"); expect(html).not.toContain("PRIVATE");
  });
  it("does not claim old results include detailed attempt comparison", async () => {
    const fixture = learningBackupFixture(); const review = await compareBackupLearningRecords(fixture.archive.localStorage, []);
    Reflect.deleteProperty(review, "attempts"); Reflect.deleteProperty(review, "attemptComparisonVersion");
    const html = renderToStaticMarkup(<LearningComparisonReview review={review} />);
    expect(html).toContain("Для детализации попыток по ID повторите проверку архива");
    expect(html).not.toContain("Попытки внутри ответа по ID");
  });
});
