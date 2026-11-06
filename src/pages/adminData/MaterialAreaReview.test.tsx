import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MaterialAreaReview from "./MaterialAreaReview";
import DifferenceReview from "./DifferenceReview";
import { ConflictPreviewContext } from "./ConflictPreviewContext";
import type { BackupMaterialAreaComparison } from "../../domain/backupMaterialArea";
import type { BackupDifference } from "../../domain/backupComparison";

const matched: BackupMaterialAreaComparison = { version: 1, archive: { status: "matched", kind: "user" }, browser: { status: "matched", kind: "user" }, relation: "same" };
describe("collapsed material-area comparisons", () => {
  it("keeps details collapsed and separates catalog evidence from restoration rights", () => {
    const html = renderToStaticMarkup(<MaterialAreaReview review={matched} />);
    expect(html).toContain("Области материала · совпадают"); expect(html).not.toContain('open=""'); expect(html).toContain("Архив</dt>"); expect(html).toContain("Этот браузер</dt>");
    expect(html).toContain("Личная область связана с учёткой источника"); expect(html).toContain("Происхождение, права и связи итогового набора ещё требуют проверки"); expect(html).not.toContain("<button");
  });
  it("shows unresolved and different relationships without implying ownership is verified", () => {
    const unresolved = renderToStaticMarkup(<MaterialAreaReview review={{ version: 1, archive: { status: "ambiguous-area", kind: "group" }, browser: { status: "unavailable-catalog", kind: "group" }, relation: "unresolved" }} />);
    expect(unresolved).toContain("не подтверждены"); expect(unresolved).toContain("несколько пар дисциплины и группы"); expect(unresolved).toContain("Не прочитан справочник дисциплин или групп");
    const different = renderToStaticMarkup(<MaterialAreaReview review={{ ...matched, relation: "different" }} />);
    expect(different).toContain("Области материала · различаются"); expect(different).toContain("не разрешает выбор версии");
  });
  it("appears in the existing file row without enabling a file-preview action", () => {
    const difference: BackupDifference = { kind: "different", area: "Материалы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-cabinet", store: "teacher-files", key: { type: "string", value: "file-1" } }, fileDifference: { version: 1, status: "compared", fields: ["description"], issues: [], ownership: "unverified", materialArea: matched } };
    const html = renderToStaticMarkup(<ConflictPreviewContext.Provider value={() => {}}><DifferenceReview differences={[difference]} /></ConflictPreviewContext.Provider>);
    expect(html).toContain("Области материала · совпадают"); expect(html).toContain("Принадлежность и права на файл не подтверждены"); expect(html).not.toContain("Сравнить версии</button>");
  });
});
