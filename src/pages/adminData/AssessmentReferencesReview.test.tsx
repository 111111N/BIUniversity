import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AssessmentReferencesReview from "./AssessmentReferencesReview";
import type { AssessmentReferenceReview } from "../../domain/backupAssessmentReferences";

const base: AssessmentReferenceReview = { scope: "assessment-reference-presence", status: "references-present", counts: { references: 5, found: 5, missing: 0, unresolved: 0, unavailable: 0 }, issues: [] };
describe("assessment reference check presentation", () => {
  it("describes exact ID presence separately from historical authority", () => {
    const html = renderToStaticMarkup(<AssessmentReferencesReview review={base} />);
    expect(html).toContain("Связанные ID найдены в выбранных карточках справочников");
    expect(html).toContain("Найдено ссылок: 5 из 5"); expect(html).toContain("требуют отдельного подтверждения");
    expect(html).not.toContain("Восстановить");
  });
  it("shows missing, unavailable and unresolved references using the existing searchable difference list", () => {
    const html = renderToStaticMarkup(<AssessmentReferencesReview review={{ ...base, status: "blocked", counts: { references: 5, found: 2, missing: 1, unresolved: 1, unavailable: 1 }, issues: [
      { code: "missing-reference", target: "accounts", referenceId: "student-missing", message: "Нужный ID не найден." },
      { code: "unresolved-reference", target: "groups", referenceId: "group-conflict", message: "Выберите версию карточки." },
      { code: "missing-source", target: "subjects", message: "Справочник отсутствует." },
    ] }} />);
    expect(html).toContain("Есть непроверенные ссылки на справочники"); expect(html).toContain("student-missing"); expect(html).toContain("group-conflict");
    expect(html).toContain("Нужный ID не найден"); expect(html).toContain("Справочник отсутствует");
    expect(html).toContain("Замечания к ссылкам выбранных аттестаций");
  });
});
