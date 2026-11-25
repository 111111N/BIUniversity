import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import { createBackupIssueCollector } from "./backupIssueCollector";
import { inspectArchivedTeachingPublicationVersions } from "./backupTeachingPublicationVersions";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import type { ManagedLesson, ManagedScheduleSnapshot, SchedulePublicationVersion } from "./scheduleManagement";
import { teachingAssignmentAllowsLesson, type TeachingAssignmentsDocument } from "./teachingAssignments";

const areaKey = (row: { teacherId: string; subjectId: string; groupId: string }) => JSON.stringify([row.teacherId, row.subjectId, row.groupId]);
const weekKey = (version: SchedulePublicationVersion) => JSON.stringify([version.week.groupId, version.week.weekStart]);

/** Only earlier whole-week publication snapshots establish active lessons; journal copies are not active publications. */
export async function inspectArchivedTeachingPublications(document: TeachingAssignmentsDocument, schedule: ManagedScheduleSnapshot | undefined, periods: AcademicPeriodsDocument | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("защите будущих публикаций при изменении назначений"), budget = createBackupBudget();
  let work = 0, restricted = 0, checked = 0, blocked = 0, ambiguous = 0, unconfirmed = 0;
  const step = async (count = 1) => {
    const before = work; work += count;
    if (work > BACKUP_LIMITS.nodes) throw new Error("Сверка назначений с будущими публикациями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(work / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind: "teachingAssignments", level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    const publications = schedule?.publications ?? [];
    for (const rows of [document.history, publications, periods?.history ?? []]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник сверки назначений с публикациями превышает 25 000 событий. Частичный результат не создан.");
    const referenceReview = await inspectArchivedTeachingPublicationVersions(document, schedule, completedAt, signal);
    for (const issue of referenceReview.issues) add(issue);
    if (!document.history.length) return { issues, summary: `Защита будущих публикаций: изменений назначений нет. Полнота истории и исторические права этим не подтверждены. ${referenceReview.summary}` };
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница сверки назначений с будущими публикациями.");
    await step(periods?.history.length ?? 0);
    const lookup = periods && createAssessmentPeriodHistoryLookup(periods);
    const ties = new Map<number, Set<string>>(), tiedAreas = new Set<string>(), baselineIds = new Set<string>();
    let previous = -Infinity, copies = 0;
    for (const version of publications) {
      await step(); const time = Date.parse(version.occurredAt), key = weekKey(version);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок публикаций для сверки назначений преподавателей.");
      previous = time; copies += version.week.lessons.length;
      if (copies > BACKUP_LIMITS.records) throw new Error("Копий занятий для сверки назначений больше 25 000. Частичный результат не создан.");
      addBackupText(budget, version.id);
      const weeks = ties.get(time) ?? new Set<string>();
      if (!weeks.has(key)) addBackupText(budget, JSON.stringify([time, key]));
      weeks.add(key); ties.set(time, weeks);
      const ids = new Set<string>();
      for (const lesson of version.week.lessons) {
        await step();
        if (ids.has(lesson.id) || version.origin === "saved-snapshot" && baselineIds.has(lesson.id)) throw new Error("Версия публикации или общий ранний снимок содержат повторяющийся ID занятия. Частичная сверка назначений не создана.");
        ids.add(lesson.id); if (version.origin === "saved-snapshot") baselineIds.add(lesson.id);
        const scope = JSON.stringify([time, areaKey(lesson)]);
        if (!tiedAreas.has(scope)) addBackupText(budget, scope);
        tiedAreas.add(scope);
        addBackupText(budget, JSON.stringify([lesson.id, lesson.teacherId, lesson.subjectId, lesson.groupId, lesson.date, lesson.endsAt, lesson.type]));
      }
    }
    const active = new Map<string, Map<string, { versionId: string; lessons: ManagedLesson[] }>>(), weekAreas = new Map<string, Set<string>>();
    let position = 0; previous = -Infinity;
    for (const event of document.history) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок изменений назначений для сверки публикаций.");
      previous = time;
      if (event.after.mode !== "periods") continue;
      restricted++;
      if (time > cutoff) {
        unconfirmed++;
        finding("review", "unchecked-teaching-publications-after-cutoff", "Изменение назначения позже границы архива не сопоставлялось с публикациями.", event.id);
        continue;
      }
      // Each publication replaces its entire week, including an explicitly emptied week.
      while (position < publications.length && Date.parse(publications[position].occurredAt) < time) {
        await step(); const version = publications[position++], key = weekKey(version);
        for (const scope of weekAreas.get(key) ?? []) {
          await step(); const weeks = active.get(scope)!; weeks.delete(key);
          if (!weeks.size) active.delete(scope);
        }
        const areas = new Set<string>();
        for (const lesson of version.week.lessons) {
          await step(); const scope = areaKey(lesson), weeks = active.get(scope) ?? new Map<string, { versionId: string; lessons: ManagedLesson[] }>();
          if (!areas.has(scope)) { weeks.set(key, { versionId: version.id, lessons: [] }); areas.add(scope); }
          weeks.get(key)!.lessons.push(lesson); active.set(scope, weeks);
        }
        weekAreas.set(key, areas);
      }
      let trusted = Boolean(lookup);
      for (const entry of event.after.periods) { await step(); if (!lookup?.(entry.period, event.occurredAt)) trusted = false; }
      if (!trusted && event.after.periods.length) {
        unconfirmed++;
        finding("review", "unchecked-teaching-publication-period", "Снимки семестров этой версии назначения не подтверждены их историей; запрет для опубликованных занятий не выводился.", event.id);
        continue;
      }
      const scope = areaKey(event.after), tiedWeeks = ties.get(time);
      let hasTie = tiedAreas.has(JSON.stringify([time, scope]));
      for (const [key, publication] of active.get(scope) ?? []) {
        await step();
        if (tiedWeeks?.has(key)) { hasTie = true; continue; }
        for (const lesson of publication.lessons) {
          await step(); const end = Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`);
          if (!Number.isFinite(end)) throw new Error("Публикация не содержит корректного времени окончания занятия.");
          if (end <= time) continue;
          checked++;
          if (!teachingAssignmentAllowsLesson(event.after, lesson)) {
            blocked++;
            finding("error", "teaching-change-excludes-future-publication", "Новая версия назначения исключает дату или тип будущего занятия из предшествующей активной публикации; действующее правило запрещает такое изменение.", event.id, JSON.stringify([publication.versionId, lesson.id]));
          }
        }
      }
      if (hasTie) {
        ambiguous++;
        finding("review", "ambiguous-teaching-publication-order", "Связанная публикация и изменение назначения имеют одинаковое время. Состояние этой недели до изменения не выбрано по порядку разных документов.", event.id);
      }
    }
    if (restricted) {
      if (!schedule) finding("review", "unchecked-teaching-publications-source", "Полный источник расписания отсутствует. Защита будущих публикаций при изменении назначения не подтверждена; живое расписание не подставлялось.");
      else if (!publications.length) finding("review", "unchecked-teaching-publications-history", "История версий публикаций отсутствует или пуста. По текущему расписанию и оставшимся карточкам журнала состояние до изменения назначения не восстанавливалось.");
      else finding("review", "unconfirmed-teaching-publication-coverage", "Проверены только недели из строго предшествующих архивных публикаций. Полнота раннего расписания, старые общие назначения и исторические полномочия не подтверждены; текущие публикации и оставшиеся карточки журнала не подставлялись.");
    }
    checkBackupAbort(signal);
    return { issues, summary: `Защита будущих публикаций: ограниченных версий назначений ${restricted}; проверенных будущих занятий ${checked}; исключений даты или типа ${blocked}; неоднозначных событий ${ambiguous}; неподтверждённых версий ${unconfirmed}. Полнота истории и исторические права этим не подтверждены. ${referenceReview.summary}` };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось сверить исторические назначения преподавателей с будущими публикациями:", error);
    throw error;
  }
}
