import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotificationComparisonReview from "./NotificationComparisonReview";
import { compareBackupNotificationRecords } from "../../domain/backupNotificationComparison";
import { notificationBackupFixture } from "../../testSupport/localBackupDocuments";
import { ConflictPreviewContext } from "./ConflictPreviewContext";

describe("notification comparison review", () => {
  it("shows paged metadata and an explicit preview action without text or addresses", async () => {
    const fixture = notificationBackupFixture(), archive = structuredClone(fixture.archive.localStorage);
    fixture.notifications[0].body = "PRIVATE NEW BODY"; fixture.save();
    const review = await compareBackupNotificationRecords(archive, fixture.archive.localStorage);
    const html = renderToStaticMarkup(<ConflictPreviewContext.Provider value={() => {}}><NotificationComparisonReview review={review} /></ConflictPreviewContext.Provider>);
    expect(html).toContain("Уведомления по ID"); expect(html).toContain("Изменены поля: текст"); expect(html).toContain("Сравнить версии</button>");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("schedule?date"); expect(html).not.toContain('details open='); expect(html).not.toContain("Восстановить</button>");
  });
  it("explains unresolved recipients instead of claiming an empty comparable source", async () => {
    const fixture = notificationBackupFixture(); const entries = fixture.archive.localStorage.filter(entry => entry.key !== "bi-university-accounts-v1");
    const review = await compareBackupNotificationRecords(entries, []), html = renderToStaticMarkup(<NotificationComparisonReview review={review} />);
    expect(html).toContain("не сравнено 1"); expect(html).toContain("Постоянный ID или явный получатель уведомления не подтверждены"); expect(html).toContain("Нет сравнимых списков уведомлений"); expect(html).not.toContain("PRIVATE");
  });
  it("renders nothing when neither source has saved notification documents", async () => {
    const review = await compareBackupNotificationRecords([], []);
    expect(renderToStaticMarkup(<NotificationComparisonReview review={review} />)).toBe("");
  });
});
