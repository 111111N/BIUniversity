import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DifferenceReview from "./DifferenceReview";
import { ConflictPreviewContext } from "./ConflictPreviewContext";
import { describeBackupFileDifference } from "./fileDifferenceDescription";
import type { BackupFileDifferenceDetails } from "../../domain/backupFileDifference";
import type { BackupDifference } from "../../domain/backupComparison";

const detail = (): BackupFileDifferenceDetails => ({ version: 1, status: "compared", fields: ["description", "content"], issues: [], ownership: "unverified" });
const row = (fileDifference: BackupFileDifferenceDetails): BackupDifference => ({ kind: "different", area: "Материалы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-cabinet", store: "teacher-files", key: { type: "string", value: "file-1" } }, fileDifference });
describe("file-difference descriptions", () => {
  it("shows changed field names and unverified ownership without enabling a preview or choice", () => {
    const html = renderToStaticMarkup(<ConflictPreviewContext.Provider value={() => {}}><DifferenceReview differences={[row(detail())]} /></ConflictPreviewContext.Provider>);
    expect(html).toContain("Изменены: описание, содержимое"); expect(html).toContain("Принадлежность и права на файл не подтверждены");
    expect(html).not.toContain("Сравнить версии</button>"); expect(html).not.toContain("Выбрать из архива"); expect(html).not.toContain("base64");
  });
  it("distinguishes partial metadata from an unexamined file and keeps source labels", () => {
    const partial = describeBackupFileDifference({ ...detail(), status: "partial", fields: [], issues: [{ source: "browser", reason: "unknown-fields" }] });
    expect(partial).toContain("Разбор различий файла неполный"); expect(partial).toContain("Этот браузер: дополнительные поля не проверены"); expect(partial).not.toContain("Изменены:");
    const unknown = describeBackupFileDifference({ ...detail(), status: "uncompared", fields: [], issues: [{ source: "archive", reason: "unsupported-store" }, { source: "browser", reason: "invalid-record" }] });
    expect(unknown).toContain("Различия полей файла не разобраны"); expect(unknown).toContain("Архив: схема хранилища не поддерживается"); expect(unknown).toContain("Этот браузер: запись или метаданные файла не прошли проверку");
  });
  it("retains existing custom descriptions and leaves old file reports readable", () => {
    const file = row(detail());
    const html = renderToStaticMarkup(<DifferenceReview differences={[file]} describeDifference={() => "Общий контекст"} />);
    expect(html).toContain("Общий контекст Изменены: описание");
    delete file.fileDifference; const legacy = renderToStaticMarkup(<DifferenceReview differences={[file]} />);
    expect(legacy).toContain("file-1"); expect(legacy).not.toContain("Изменены:"); expect(describeBackupFileDifference()).toBe("");
  });
});
