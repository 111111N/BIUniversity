import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BackupDocumentReview } from "../../domain/localBackupDocuments";
import RestoreAdmissionReview from "./RestoreAdmissionReview";

const review = (): BackupDocumentReview => ({ checks: [], issues: [], uncheckedKeys: [], counts: { valid: 0, invalid: 0, absent: 0, unchecked: 0, errors: 0, reviews: 0 } });
describe("restore admission summary", () => {
  it("explains whole-archive blocking and links to the existing paged findings", () => {
    const value = review(); value.issues.push({ level: "review", kind: "accounts", code: "unchecked-owner", message: "PRIVATE DETAIL" }); value.counts.reviews++;
    const html = renderToStaticMarkup(<RestoreAdmissionReview review={value} />);
    expect(html).toContain("Восстановление всего архива заблокировано"); expect(html).toContain("Не подтверждено: 1"); expect(html).toContain('href="#backup-documents-title"');
    expect(html).toContain("восстановить отдельную часть архива нельзя"); expect(html).not.toContain("PRIVATE DETAIL"); expect(html).not.toContain("<button");
  });
  it("keeps remaining work collapsed and does not announce readiness from zero findings", () => {
    const html = renderToStaticMarkup(<RestoreAdmissionReview review={review()} />);
    expect(html).toContain("Документы проверены; нужны итоговые проверки"); expect(html).toMatch(/<details[^>]*><summary>Что ещё требуется/);
    expect(html).toContain("не разрешает запись данных"); expect(html).not.toContain("Готов к восстановлению"); expect(html).not.toContain('href="#backup-documents-title"');
  });
  it("makes incomplete old inspection results explicitly blocking", () => {
    const value = review(); value.counts.unchecked = 1; delete value.uncheckedKeys;
    const html = renderToStaticMarkup(<RestoreAdmissionReview review={value} />);
    expect(html).toContain("Восстановление всего архива заблокировано"); expect(html).toContain("Результат проверки неполон");
  });
});
