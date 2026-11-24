import type { JournalChange } from "../data/journalStore";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import { createBackupIssueCollector } from "./backupIssueCollector";
import type { GroupCalendar, GroupCalendarEvent, GroupCalendarsDocument } from "./groupCalendarTypes";
import { calendarRestrictsEditing } from "./groupCalendars";
import type { JournalTeachingArea } from "./journalTeachingArea";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";

interface JournalHistorySource { key: string; area: JournalTeachingArea; changes: readonly JournalChange[] }
interface Operation { key: string; id: string; area: JournalTeachingArea; field: JournalChange["field"]; lessonId?: string; time: number }
interface CalendarState { calendar: GroupCalendar; trustedPeriod: boolean }
const lessonKey = (id: string, subjectId: string, groupId: string) => JSON.stringify([id, subjectId, groupId]);
const covers = (calendar: GroupCalendar, date: string) => date >= calendar.period.term.startsOn && date <= calendar.period.term.endsOn;

/** Read-only history check: publication snapshots supply past managed lesson dates, never today's journal cards. */
export async function inspectArchivedJournalCalendars(histories: Iterable<JournalHistorySource>, schedule: ManagedScheduleSnapshot | undefined, calendars: GroupCalendarsDocument | undefined, periods: AcademicPeriodsDocument | undefined, completedAt: string | undefined, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим календарям журналов"), budget = createBackupBudget();
  let work = 0, checked = 0, blocked = 0, unconfigured = 0, unconfirmed = 0;
  const step = async (count = 1) => {
    const before = work; work += count;
    if (work > BACKUP_LIMITS.nodes) throw new Error("Сверка журналов с календарями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(work / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (operation: Operation, level: "review" | "error", code: string, message: string, calendarId?: string) => add({ kind: "journalHistory", level, code, message, referenceId: operation.key, recordId: calendarId === undefined ? operation.id : JSON.stringify([operation.id, calendarId]) });
  try {
    checkBackupAbort(signal);
    const cutoff = completedAt === undefined ? NaN : Date.parse(completedAt), operations: Operation[] = [];
    let lists = 0;
    for (const source of histories) {
      await step();
      if (++lists > BACKUP_LIMITS.records || operations.length + source.changes.length > BACKUP_LIMITS.records) throw new Error("Списков или событий журналов для сверки календарей больше 25 000. Частичный результат не создан.");
      addBackupText(budget, source.key);
      for (const change of source.changes) {
        await step(); const time = Date.parse(change.changedAt);
        if (!Number.isFinite(time)) throw new Error("История журнала не содержит корректного времени изменения.");
        operations.push({ key: source.key, id: change.id, area: source.area, field: change.field, ...(change.lessonId === undefined ? {} : { lessonId: change.lessonId }), time });
        addBackupText(budget, JSON.stringify([change.id, change.lessonId]));
      }
    }
    if (!operations.length) return { issues, summary: "Исторические календари журналов: читаемых событий нет. Полнота ранней истории, состав и исторические права этим не подтверждены." };
    const publications = schedule?.publications ?? [], calendarEvents = calendars?.history ?? [];
    for (const rows of [publications, calendarEvents, periods?.history ?? []]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник исторических календарей журналов превышает предел записей. Частичный результат не создан.");
    await step(periods?.history.length ?? 0);
    const lookup = periods && createAssessmentPeriodHistoryLookup(periods);
    const publicationTies = new Map<number, Set<string>>(), calendarTies = new Map<string, GroupCalendarEvent[]>();
    let copies = 0, previous = -Infinity;
    const baselineIds = new Set<string>();
    for (const publication of publications) {
      await step(); const time = Date.parse(publication.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок версий публикаций для сверки журнала.");
      previous = time; copies += publication.week.lessons.length;
      if (copies > BACKUP_LIMITS.records) throw new Error("Копий занятий для сверки журналов больше 25 000. Частичный результат не создан.");
      const keys = publicationTies.get(time) ?? new Set<string>(); publicationTies.set(time, keys);
      const versionIds = new Set<string>();
      for (const lesson of publication.week.lessons) {
        await step(); const key = lessonKey(lesson.id, lesson.subjectId, lesson.groupId);
        if (versionIds.has(lesson.id) || publication.origin === "saved-snapshot" && baselineIds.has(lesson.id)) throw new Error("Архивная версия или общий ранний снимок содержат повторяющийся ID занятия. Дата не выбрана по последнему совпадению; частичная сверка журналов не создана.");
        versionIds.add(lesson.id); if (publication.origin === "saved-snapshot") baselineIds.add(lesson.id);
        if (!keys.has(key)) addBackupText(budget, key);
        keys.add(key);
      }
    }
    previous = -Infinity;
    for (const event of calendarEvents) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок календарей для сверки журнала.");
      previous = time;
      const key = JSON.stringify([time, event.after.group.id]), rows = calendarTies.get(key) ?? [];
      if (!calendarTies.has(key)) addBackupText(budget, key);
      rows.push(event); calendarTies.set(key, rows);
    }
    operations.sort((a, b) => a.time - b.time);
    const lessonDates = new Map<string, string>(), active = new Map<string, Map<string, CalendarState>>();
    let publicationPosition = 0, calendarPosition = 0;
    for (const operation of operations) {
      await step();
      if (!Number.isFinite(cutoff) || operation.time > cutoff) {
        unconfirmed++; finding(operation, "review", "unchecked-journal-calendar-time", "Граница проверки или время события не позволяют подтвердить календарь операции журнала. Время устройства и дата занятия не использованы вместо времени изменения."); continue;
      }
      if (operation.area.status !== "matched") {
        unconfirmed++; finding(operation, "review", "unchecked-journal-calendar-area", "Учебная область истории не определена однозначно. Календарь другой группы, название и текущие назначения не подставлялись."); continue;
      }
      if (operation.field === "roster" || operation.field === "demo") {
        unconfirmed++; finding(operation, "review", "unchecked-journal-calendar-batch", "Событие состава или пакетного демозаполнения не сохраняет точный перечень затронутых занятий и дат. Текущий состав и итоговые ячейки не использованы для восстановления прошлого действия."); continue;
      }
      if (!operation.lessonId?.startsWith("managed:") || !schedule || schedule.version !== 2) {
        unconfirmed++; finding(operation, "review", "unchecked-journal-calendar-lesson-source", "Точная дата занятия на момент изменения не подтверждена стабильным ID и историей публикаций. Старый ключ, текущая карточка, черновики и встроенные занятия не использовались."); continue;
      }
      // Retained identities keep their last date. A saved-snapshot proves it only from capture time onward.
      while (publicationPosition < publications.length && Date.parse(publications[publicationPosition].occurredAt) < operation.time) {
        await step(); const publication = publications[publicationPosition++];
        for (const lesson of publication.week.lessons) {
          await step(); const key = lessonKey(lesson.id, lesson.subjectId, lesson.groupId);
          if (!lessonDates.has(key)) addBackupText(budget, key);
          lessonDates.set(key, lesson.date);
        }
      }
      const key = lessonKey(operation.lessonId, operation.area.subjectId, operation.area.groupId), date = lessonDates.get(key);
      if (publicationTies.get(operation.time)?.has(key)) {
        unconfirmed++; finding(operation, "review", "ambiguous-journal-publication-order", "Затрагивающая занятие публикация или фиксация раннего снимка и изменение журнала имеют одинаковое время в разных документах. Дата до или после этой фиксации не выбрана автоматически."); continue;
      }
      if (!date) {
        unconfirmed++; finding(operation, "review", "unchecked-journal-calendar-lesson-date", "До изменения журнала не найден опубликованный снимок точного занятия в той же дисциплине и группе. Более поздняя публикация и текущий журнал не подставлялись в прошлое."); continue;
      }
      if (!calendars) {
        unconfirmed++; finding(operation, "review", "unchecked-journal-calendar-source", "Полный согласованный источник календарей отсутствует. Закрытие периода на момент изменения журнала не проверено; данные другого источника не подставлялись."); continue;
      }
      while (calendarPosition < calendarEvents.length && Date.parse(calendarEvents[calendarPosition].occurredAt) < operation.time) {
        await step(); const event = calendarEvents[calendarPosition++], groupId = event.after.group.id;
        const states = active.get(groupId) ?? new Map<string, CalendarState>();
        states.set(event.after.id, { calendar: event.after, trustedPeriod: Boolean(lookup?.(event.after.period, event.occurredAt)) }); active.set(groupId, states);
      }
      let unknown = false, forbidden = false, relevant = false;
      const ambiguous = new Set<string>();
      for (const event of calendarTies.get(JSON.stringify([operation.time, operation.area.groupId])) ?? []) {
        await step(); if (!covers(event.after, date) && !(event.before && covers(event.before, date))) continue;
        ambiguous.add(event.after.id); unknown = true;
        finding(operation, "review", "ambiguous-journal-calendar-order", "Изменение журнала и затрагивающее дату изменение календаря имеют одинаковое время в разных документах. Порядок закрытия или переоткрытия не восстановлен по ID и позиции списка.", event.after.id);
      }
      for (const state of active.get(operation.area.groupId)?.values() ?? []) {
        await step(); if (ambiguous.has(state.calendar.id)) continue;
        if (!state.trustedPeriod) {
          unknown = true; finding(operation, "review", "unchecked-journal-calendar-period", "Снимок семестра календаря не подтверждён согласованной историей периодов. По нему не выдано разрешение или запрет изменения журнала.", state.calendar.id); continue;
        }
        if (!covers(state.calendar, date)) continue;
        relevant = true;
        if (calendarRestrictsEditing(state.calendar, operation.area.groupId, [date])) {
          forbidden = true; finding(operation, "error", "journal-calendar-restriction", "По однозначной истории дата занятия попадала в закрытый период на момент сохранения изменения журнала. Позднее переоткрытие не снимает замечание; отметки и даты не изменялись.", state.calendar.id);
        }
      }
      if (forbidden) blocked++; if (unknown) unconfirmed++; else if (relevant) checked++; else unconfigured++;
    }
    checkBackupAbort(signal);
    return { issues, summary: `Исторические календари журналов: прочитанных событий ${operations.length}; сверено по календарю ${checked}; с известным запретом ${blocked}; без затрагивающей настройки ${unconfigured}; не подтверждено ${unconfirmed}. Даты берутся из более ранних опубликованных снимков точных занятий; время saved-snapshot не принято за первоначальную публикацию. Проверяется закрытый период без нового запрета по праздникам и каникулам. Полнота аудита, состав и исторические права не подтверждены.` };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось сверить сохранённые изменения журналов с историческими календарями групп:", error);
    throw error;
  }
}
