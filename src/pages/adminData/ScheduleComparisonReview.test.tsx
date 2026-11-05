import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareBackupScheduleRecords } from "../../domain/backupScheduleComparison";
import { coreBackupFixture } from "../../testSupport/localBackupDocuments";
import ScheduleComparisonReview from "./ScheduleComparisonReview";

describe("schedule lesson comparison disclosure", () => {
  it("shows scoped journal changes without exposing teacher or room values", async () => {
    const fixture = coreBackupFixture(); const lesson = fixture.schedule.drafts[0].lessons[0];
    fixture.schedule.drafts = []; fixture.schedule.journal = [{ ...lesson, journalState: "cancelled" }]; fixture.save();
    const original = structuredClone(fixture.archive.localStorage);
    fixture.schedule.journal[0].room = "PRIVATE ROOM"; fixture.schedule.journal[0].journalState = "rescheduled"; fixture.save();
    const html = renderToStaticMarkup(<ScheduleComparisonReview review={await compareBackupScheduleRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("Связи занятий с журналом по ID"); expect(html).toContain("Изменены поля: аудитория, состояние связи.");
    expect(html).toContain("Дисциплина: subject-1 · Группа: group-1"); expect(html).toContain("Это не история изменения оценок");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toMatch(/<details[^>]*\bopen=/); expect(html).not.toContain("Восстановить</button>");
  });
  it("does not claim old schedule results contain journal detail", async () => {
    const fixture = coreBackupFixture(); const review = await compareBackupScheduleRecords(fixture.archive.localStorage, []);
    Reflect.deleteProperty(review, "journal"); Reflect.deleteProperty(review, "journalComparisonVersion");
    const html = renderToStaticMarkup(<ScheduleComparisonReview review={review} />);
    expect(html).toContain("Для детализации повторите проверку архива"); expect(html).not.toContain("Связи занятий с журналом по ID");
  });
  it("keeps mode details collapsed and names fields without teacher or room values", async () => {
    const fixture = coreBackupFixture(); const original = structuredClone(fixture.archive.localStorage);
    fixture.schedule.drafts[0].lessons[0].room = "PRIVATE ROOM"; fixture.schedule.drafts[0].lessons[0].teacherName = "PRIVATE TEACHER"; fixture.save();
    const html = renderToStaticMarkup(<ScheduleComparisonReview review={await compareBackupScheduleRecords(original, fixture.archive.localStorage)} />);
    expect(html).toContain("Пары расписания по ID"); expect(html).not.toMatch(/<details[^>]*\bopen=/);
    expect(html).toContain("Изменены поля: имя преподавателя, аудитория."); expect(html).toContain('aria-label="Различия пар черновиков"');
    expect(html).toContain("отсутствующий черновик не заполняется публикацией"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("Опубликовать</button>");
  });
  it("surfaces one failed document for both modes without a false empty schedule", async () => {
    const review = await compareBackupScheduleRecords([], [{ key: "bi-university-managed-schedule-v1", raw: "PRIVATE{broken" }]);
    const html = renderToStaticMarkup(<ScheduleComparisonReview review={review} />);
    expect(html).toContain("Пары расписания по ID · не сравнено 1"); expect(html).toContain("Этот браузер"); expect(html).not.toContain("PRIVATE");
  });
  it("limits long lists to a page and omits the section for absent sources", async () => {
    const fixture = coreBackupFixture(); const lesson = fixture.schedule.drafts[0].lessons[0];
    fixture.schedule.drafts[0].lessons = Array.from({ length: 45 }, (_, index) => ({ ...lesson, id: `managed:lesson-${String(index).padStart(2, "0")}`, scheduleId: index + 1 })); fixture.save();
    const html = renderToStaticMarkup(<ScheduleComparisonReview review={await compareBackupScheduleRecords(fixture.archive.localStorage, [])} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(20); expect(html).toContain("Страница 1 из 3"); expect(html).not.toContain("managed:lesson-44");
    expect(renderToStaticMarkup(<ScheduleComparisonReview review={await compareBackupScheduleRecords([], [])} />)).toBe("");
  });
});
