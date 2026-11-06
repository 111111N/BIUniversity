import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InspectionPanel from "./InspectionPanel";
import type { BackupInspection } from "../../data/localBackupInspectionService";
import { compareBackupPlannerRecords } from "../../domain/backupPlannerComparison";
import { getPlannerStorageKey } from "../../domain/plannerStorage";
import { compareBackupCatalogRecords } from "../../domain/backupCatalogComparison";
import { compareBackupAccountRecords } from "../../domain/backupAccountComparison";
import { compareBackupLearningRecords } from "../../domain/backupLearningComparison";
import { learningBackupFixture } from "../../testSupport/localBackupDocuments";
import { compareBackupScheduleRecords } from "../../domain/backupScheduleComparison";
import { compareBackupJournalRecords } from "../../domain/backupJournalComparison";
import { compareBackupNotificationRecords } from "../../domain/backupNotificationComparison";
import { notificationBackupFixture } from "../../testSupport/localBackupDocuments";

const noop = () => undefined;
const result: BackupInspection = {
  actor: { id: "configurator-demo", revision: 1 },
  filename: "archive.json", source: { origin: "https://portal.example", basePath: "/" }, completedAt: "2026-10-28T10:00:00Z", inspectedAt: "2026-10-28T10:00:00Z", sha256: "abc123",
  totals: { storageEntries: 4, databaseRecords: 3, files: 2, binaryBytes: 2 }, warnings: ["Архив не подписан"],
  comparison: { same: 1, new: 2, different: 3, currentOnly: 4, schema: 0, differences: [] },
  documents: { checks: [], issues: [], counts: { valid: 0, invalid: 0, absent: 12, unchecked: 0, errors: 0, reviews: 0 } },
};
const render = (patch = {}) => renderToStaticMarkup(<InspectionPanel file={null} busy={false} progress="" error="" result={null} unavailable={false} reportMessage="" reportError="" onFile={noop} onInspect={noop} onCancel={noop} onReport={noop} {...patch} />);
describe("backup file preview", () => {
  it("announces unresolved material areas separately from successfully classified metadata", () => {
    const comparison: BackupInspection["comparison"] = { same: 0, new: 0, currentOnly: 0, schema: 0, different: 1, differences: [{ kind: "different", area: "Материалы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-cabinet", store: "teacher-files", key: { type: "string", value: "file-1" } }, fileDifference: { version: 1, status: "compared", fields: ["description"], issues: [], ownership: "unverified", materialArea: { version: 1, archive: { status: "matched", kind: "user" }, browser: { status: "unavailable-catalog", kind: "user" }, relation: "unresolved" } } }] };
    const html = render({ result: { ...result, comparison } });
    expect(html).toContain("Области материалов не сопоставлены: 1"); expect(html).toContain("Области материала · не подтверждены"); expect(html).toContain("Не прочитан справочник учётных записей этого источника");
    expect(html).not.toContain("Файлы с неполным разбором различий: 1");
  });
  it("announces incomplete file annotations in the main status without claiming restored ownership", () => {
    const comparison: BackupInspection["comparison"] = { same: 0, new: 0, currentOnly: 0, schema: 0, different: 1, differences: [{ kind: "different", area: "Материалы", id: "file-1", reference: { storage: "indexedDB", database: "bi-university-cabinet", store: "teacher-files", key: { type: "string", value: "file-1" } }, fileDifference: { version: 1, status: "partial", fields: ["description"], issues: [{ source: "browser", reason: "unknown-fields" }], ownership: "unverified" } }] };
    const html = render({ result: { ...result, comparison } });
    expect(html).toContain("Файлы с неполным разбором различий: 1"); expect(html).toContain("Разбор различий файла неполный"); expect(html).toContain("Принадлежность и права на файл не подтверждены");
  });
  it("announces unconfirmed notification recipients in the main status without exposing contents", async () => {
    const fixture = notificationBackupFixture(), entries = fixture.archive.localStorage.filter(entry => entry.key !== "bi-university-accounts-v1");
    const notificationComparison = await compareBackupNotificationRecords(entries, []);
    const html = render({ result: { ...result, notificationComparison } });
    expect(html).toContain("Списки уведомлений не сравнены: 1"); expect(html).toContain("Уведомления по ID"); expect(html).toContain("Постоянный ID или явный получатель уведомления не подтверждены"); expect(html).not.toContain("PRIVATE");
  });
  it("announces unresolved journal-history sources in its main status", async () => {
    const journalComparison = await compareBackupJournalRecords([{ key: "bi-university-journal-history-v1:subject-1:group-1", raw: "[]" }], []);
    const html = render({ result: { ...result, journalComparison } });
    expect(html).toContain("Источники истории журналов не сравнены: 1"); expect(html).toContain("Учебная область истории не подтверждена");
  });
  it("announces unreadable audit sources even when their account cards can be compared", async () => {
    const fixture = learningBackupFixture(); fixture.accounts.history = [{ id: "", actorId: "configurator-demo", accountId: "student-1", occurredAt: "2026-10-28T09:00:00Z", action: "created", previousRole: null, nextRole: "student" }]; fixture.save();
    const accountComparison = await compareBackupAccountRecords([], fixture.archive.localStorage);
    expect(accountComparison.counts.uncheckedDocuments).toBe(0); expect(accountComparison.history?.counts.uncheckedDocuments).toBe(1);
    const html = render({ result: { ...result, accountComparison } });
    expect(html).toContain("Документы учёток не сравнены: 1"); expect(html).toContain("Нет источников истории учёток, которые удалось сравнить");
  });
  it("counts an unreadable account document once for cards and history", async () => {
    const accountComparison = await compareBackupAccountRecords([], [{ key: "bi-university-accounts-v1", raw: "PRIVATE{broken" }]);
    const html = render({ result: { ...result, accountComparison } });
    expect(html).toContain("Документы учёток не сравнены: 1"); expect(html).not.toContain("Документы учёток не сравнены: 2"); expect(html).not.toContain("PRIVATE");
  });
  it("counts an invalid schedule document once across both modes in the main status", async () => {
    const scheduleComparison = await compareBackupScheduleRecords([], [{ key: "bi-university-managed-schedule-v1", raw: "PRIVATE{broken" }]);
    const html = render({ result: { ...result, scheduleComparison } });
    expect(html).toContain("Документы расписания не сравнены: 1"); expect(html).not.toContain("Документы расписания не сравнены: 2"); expect(html).not.toContain("PRIVATE");
  });
  it("counts each failed learning document once across parent cards and child histories", async () => {
    const fixture = learningBackupFixture(); fixture.submissions[0].text = "PRIVATE CONFLICT"; fixture.save();
    const learningComparison = await compareBackupLearningRecords([], fixture.archive.localStorage);
    const html = render({ result: { ...result, learningComparison } });
    expect(html).toContain("Списки заданий и ответов сравнены не полностью: 1");
    expect(html).not.toContain("Списки заданий и ответов сравнены не полностью: 2"); expect(html).not.toContain("PRIVATE");
  });
  it("announces unsafely comparable answer sources in the main status while keeping details collapsed", async () => {
    const fixture = learningBackupFixture(); fixture.submissions[0].text = "PRIVATE CONFLICT"; fixture.save();
    const learningComparison = await compareBackupLearningRecords([], fixture.archive.localStorage);
    const html = render({ result: { ...result, learningComparison } });
    expect(html).toContain("Списки заданий и ответов сравнены не полностью: 1"); expect(html).toContain("не сравнено 1");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Восстановить</button>");
  });
  it("announces an unsupported accounts source in the main status before the disclosure is opened", async () => {
    const accountComparison = await compareBackupAccountRecords([], [{ key: "bi-university-accounts-v2", raw: "PRIVATE" }]);
    const html = render({ result: { ...result, accountComparison } });
    expect(html).toContain("Документы учёток не сравнены: 1"); expect(html).toContain("не сравнено 1");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Восстановить</button>");
  });
  it("announces an unreadable live catalog in the main status before opening the detailed section", async () => {
    const catalogComparison = await compareBackupCatalogRecords([], [{ key: "bi-university-group-catalog-v1", raw: "PRIVATE{broken" }]);
    const html = render({ result: { ...result, catalogComparison } });
    expect(html).toContain("Каталоги не сравнены: 1"); expect(html).toContain("не сравнено 1");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Восстановить</button>");
  });
  it("announces an uncompared live planner in the main status even while its detail section is collapsed", async () => {
    const plannerComparison = await compareBackupPlannerRecords([], [{ key: getPlannerStorageKey("student-1"), raw: "PRIVATE{broken" }]);
    const html = render({ result: { ...result, plannerComparison } });
    expect(html).toContain("Списки планировщика не сравнены: 1"); expect(html).toContain("не сравнено 1");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Готов к восстановлению");
  });
  it("shows key types for file differences with matching display IDs while retaining the read-only interface", () => {
    const comparison = { ...result.comparison, differences: [
      { kind: "different" as const, area: "Файлы", id: '["number",1]', reference: { storage: "indexedDB" as const, database: "db", store: "files", key: { type: "number" as const, value: 1 } } },
      { kind: "different" as const, area: "Файлы", id: '["number",1]', reference: { storage: "indexedDB" as const, database: "db", store: "files", key: { type: "string" as const, value: '["number",1]' } } },
    ] };
    const html = render({ result: { ...result, comparison } });
    expect(html).toContain("Ключ: число"); expect(html).toContain("Ключ: строка");
    expect((html.match(/<li>/g) ?? []).length).toBe(2); expect(html).not.toContain("Восстановить</button>");
  });
  it("has an explicit labelled file chooser and no restore or upload action", () => {
    const html = render();
    expect(html).toContain('for="backup-file"'); expect(html).toContain('type="file"'); expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain("без отправки на сервер"); expect(html).toContain("Восстановление пока недоступно"); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Проверить файл/);
    expect(html).not.toContain("Восстановить</button>");
    expect(html).not.toContain("Скачать полный отчёт");
  });
  it("announces progress, supports cancellation and locks the file selector", () => {
    const html = render({ busy: true, progress: "Сравниваем вложения…" });
    expect(html).toMatch(/type="file"[^>]*disabled=""/); expect(html).toContain("Отменить</button>"); expect(html).toMatch(/role="status"[^>]*aria-live="polite"/); expect(html).toContain("Сравниваем вложения…");
  });
  it("distinguishes readonly format checking from restoration and exposes comparison limitations", () => {
    const html = render({ result });
    for (const value of ["данные не восстановлены", "а не студенты", "Совпадают", "Только в браузере", "Архив не подписан", "abc123", "учебных связей"]) expect(html).toContain(value);
  });
  it("offers a full report only with results, identifies its contents and reports download errors separately", () => {
    const html = render({ result, reportError: "Доступ отозван" });
    expect(html).toMatch(/<button[^>]*>Скачать полный отчёт<\/button>/);
    expect(html).toContain("идентификаторы записей");
    expect(html).toContain("Это не резервная копия для восстановления");
    expect(html).toContain("Исходные документы и вложения в него не включаются");
    expect(html).toContain("Доступ отозван");
    expect(html).toContain("Документы и учебные ссылки");
  });
  it("announces handoff honestly and disables report download without access", () => {
    const html = render({ result, unavailable: true, reportMessage: "Отчёт передан браузеру для скачивания" });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Скачать полный отчёт/);
    expect(html).toContain("Отчёт передан браузеру для скачивания");
    expect(html).not.toContain("успешно сохранён");
  });
  it("limits the visible difference list and escapes archive names and IDs", () => {
    const comparison = { ...result.comparison, differences: Array.from({ length: 43 }, (_, index) => ({ kind: "different" as const, area: "Материалы", id: index === 0 ? "<script>bad()</script>" : `record-${index}` })) };
    const html = render({ result: { ...result, filename: "<b>archive</b>", comparison } });
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3"); expect(html).not.toContain("record-20");
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<b>archive</b>");
  });
  it("exposes difference filters and labels without confusing them with the complete comparison", () => {
    const comparison = { ...result.comparison, differences: [{ kind: "current-only" as const, area: "Материалы <script>", id: "only-here" }] };
    const html = render({ result: { ...result, comparison } });
    expect(html).toContain('aria-label="Тип различий с браузером"'); expect(html).toContain("Область сравнения");
    expect(html).toContain("Найти различие по области или ID"); expect(html).toContain('placeholder=""'); expect(html).toContain("Найдено: 1 из 1");
    expect(html).toContain("Итоги сравнения и полный JSON-отчёт содержат все различия"); expect(html).toContain("этот просмотр ничего не удаляет");
    expect(html).toContain("Материалы &lt;script&gt;"); expect(html).not.toContain("Материалы <script>");
    expect(html).toContain("only-here"); expect(html).toContain('aria-label="Различия с текущими данными"');
  });
  it("retains an actionable file check error and blocks unavailable accounts", () => {
    const html = render({ unavailable: true, error: "Формат не поддерживается", file: new File(["{}"], "wrong.json") });
    expect(html).toContain("wrong.json"); expect(html).toContain("Формат не поддерживается"); expect(html).toContain('role="alert"'); expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Проверить файл/);
  });
});
