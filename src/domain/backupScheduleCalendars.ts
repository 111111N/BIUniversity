import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { GroupCalendar, GroupCalendarEvent, GroupCalendarsDocument } from "./groupCalendarTypes";
import { getCalendarDayIssue } from "./groupCalendars";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import { createBackupIssueCollector } from "./backupIssueCollector";

interface CalendarState { calendar: GroupCalendar; trustedPeriod: boolean }
interface DayState { covering: CalendarState[]; blocked: Set<string> }
const covers = (calendar: GroupCalendar, date: string) => date >= calendar.period.term.startsOn && date <= calendar.period.term.endsOn;

/** Decoded sources only: check explicit publications against earlier calendar states without substituting today's calendar. */
export async function inspectArchivedScheduleCalendars(schedule: ManagedScheduleSnapshot | undefined, calendars: GroupCalendarsDocument | undefined, periods: AcademicPeriodsDocument | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим календарям публикаций"), budget = createBackupBudget();
  let operations = 0, copies = 0, publications = 0, checked = 0, blocked = 0, unconfirmed = 0, unconfigured = 0;
  const step = async (work = 1) => {
    const before = operations; operations += work;
    if (operations > BACKUP_LIMITS.nodes) throw new Error("Сверка публикаций с календарями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(operations / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId: string, referenceId?: string) => add({ kind: "schedule", level, code, message, recordId, ...(referenceId === undefined ? {} : { referenceId }) });
  const countCopies = (count: number) => { copies += count; if (copies > BACKUP_LIMITS.records) throw new Error("Копий занятий для сверки календарей больше 25 000. Частичный результат не создан."); };
  const summary = () => `Исторические календари публикаций: версий ${publications}; копий занятий ${copies}; сверено по календарю ${checked}; с известным запретом ${blocked}; без настроенного календаря ${unconfigured}; не подтверждено ${unconfirmed}. Отсутствие настройки не объявляется новым запретом или подтверждением учебной фазы. Состояние берётся до события публикации, не из текущего календаря. Права автора, черновики и изменения журналов эта сверка не подтверждает.`;
  try {
    checkBackupAbort(signal);
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определён момент завершения проверки исторических календарей публикаций.");
    if (!schedule) return { issues, summary: "Исторические календари публикаций не проверены: согласованный источник расписания отсутствует." };
    for (const rows of [schedule.publications ?? [], calendars?.history ?? [], periods?.history ?? [], schedule.published]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник исторических календарей публикаций превышает предел записей. Частичный результат не создан.");
    if (schedule.version === 1) for (const week of schedule.published) {
      if (!week.lessons.length) continue;
      await step(); countCopies(week.lessons.length); unconfirmed += week.lessons.length;
      finding("review", "unconfirmed-calendar-publication-time", "У старого снимка недели нет явного события публикации. Сохранённые реквизиты недели и текущий календарь не использовались для восстановления порядка действий.", JSON.stringify(["published-week", week.groupId, week.weekStart]), week.groupId);
    }
    await step(periods?.history.length ?? 0);
    const periodLookup = periods && createAssessmentPeriodHistoryLookup(periods);
    const events = calendars?.history ?? [], ties = new Map<string, GroupCalendarEvent[]>();
    let previousCalendarTime = -Infinity;
    for (const event of events) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previousCalendarTime) throw new Error("История календарей не имеет подтверждённого порядка дат. Частичная сверка публикаций не создана.");
      previousCalendarTime = time;
      const key = JSON.stringify([time, event.after.group.id]);
      const rows = ties.get(key) ?? []; if (!ties.has(key)) addBackupText(budget, key);
      rows.push(event); ties.set(key, rows);
    }
    const active = new Map<string, Map<string, CalendarState>>(), dayCache = new Map<string, Map<string, DayState>>();
    let position = 0, tieTime = NaN; const tieCache = new Map<string, Set<string>>();
    const day = async (groupId: string, date: string) => {
      const cache = dayCache.get(groupId) ?? new Map<string, DayState>(); dayCache.set(groupId, cache);
      const known = cache.get(date); if (known) return known;
      const result: DayState = { covering: [], blocked: new Set() };
      for (const state of active.get(groupId)?.values() ?? []) {
        await step(); if (!covers(state.calendar, date)) continue;
        result.covering.push(state);
        if (state.trustedPeriod) {
          await step(state.calendar.daysOff.length + state.calendar.segments.length + 1);
          if (getCalendarDayIssue(state.calendar, date)) result.blocked.add(state.calendar.id);
        }
      }
      addBackupText(budget, JSON.stringify([groupId, date])); cache.set(date, result); return result;
    };
    const simultaneous = async (time: number, groupId: string, date: string) => {
      if (tieTime !== time) { tieCache.clear(); tieTime = time; }
      const key = JSON.stringify([groupId, date]), known = tieCache.get(key); if (known) return known;
      const ids = new Set<string>();
      for (const event of ties.get(JSON.stringify([time, groupId])) ?? []) {
        await step(); if (covers(event.after, date) || event.before && covers(event.before, date)) ids.add(event.after.id);
      }
      addBackupText(budget, key); tieCache.set(key, ids); return ids;
    };
    let previousPublicationTime = -Infinity;
    for (const publication of schedule.publications ?? []) {
      await step(); publications++; countCopies(publication.week.lessons.length);
      const time = Date.parse(publication.occurredAt);
      if (!Number.isFinite(time) || time < previousPublicationTime) throw new Error("История публикаций не имеет подтверждённого порядка дат. Частичная сверка календарей не создана.");
      previousPublicationTime = time;
      if (!publication.week.lessons.length) continue;
      if (publication.origin !== "published" || time > cutoff) {
        unconfirmed += publication.week.lessons.length;
        finding("review", "unconfirmed-calendar-publication-event", "Время фиксации раннего снимка или неподтверждённого события не принято за время публикации. Исторический календарь для этой версии не подбирался.", publication.id); continue;
      }
      if (!calendars) {
        unconfirmed += publication.week.lessons.length;
        finding("review", "unchecked-publication-calendar-source", "Календарь на дату публикации не проверен: полный источник отсутствует или не согласован. Календари браузера и встроенные периоды не подставлялись.", publication.id); continue;
      }
      // Equal instants across documents have no shared sequence; apply only strictly earlier events.
      while (position < events.length && Date.parse(events[position].occurredAt) < time) {
        await step(); const event = events[position++], groupId = event.after.group.id;
        const states = active.get(groupId) ?? new Map<string, CalendarState>();
        states.set(event.after.id, { calendar: event.after, trustedPeriod: Boolean(periodLookup?.(event.after.period, event.occurredAt)) });
        active.set(groupId, states); dayCache.delete(groupId);
      }
      for (const lesson of publication.week.lessons) {
        await step(); const id = JSON.stringify(["publication-lesson", publication.id, lesson.id]);
        const state = await day(lesson.groupId, lesson.date), ambiguous = await simultaneous(time, lesson.groupId, lesson.date);
        let unknown = false, forbidden = false;
        for (const calendarId of ambiguous) {
          await step(); unknown = true;
          finding("review", "ambiguous-publication-calendar-order", "Публикация и изменение затрагивающего дату календаря имеют одинаковое время в разных документах. Порядок не восстановлен по ID или позиции списка.", id, calendarId);
        }
        for (const entry of state.covering) {
          await step(); if (ambiguous.has(entry.calendar.id)) continue;
          if (!entry.trustedPeriod) {
            unknown = true; finding("review", "unchecked-publication-calendar-period", "Снимок семестра календаря не подтверждён согласованной историей учебных периодов на момент сохранения календаря. По нему не выдано подтверждение или запрет публикации.", id, entry.calendar.id);
          } else if (state.blocked.has(entry.calendar.id)) {
            forbidden = true; finding("error", "publication-calendar-restriction", "По однозначному сохранённому состоянию календаря на момент публикации дата занятия попадала в закрытый период, каникулы или явно заданный неучебный день. Текущие изменения календаря не применялись к прошлому; занятие не переносилось.", id, entry.calendar.id);
          }
        }
        if (!state.covering.length && !ambiguous.size) {
          unconfigured++;
        }
        if (forbidden) blocked++; if (unknown) unconfirmed++; if (!unknown && state.covering.length) checked++;
      }
    }
    checkBackupAbort(signal); return { issues, summary: summary() };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось сверить сохранённые публикации с историческими календарями групп:", error);
    throw error;
  }
}
