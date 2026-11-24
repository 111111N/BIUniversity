import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import { createBackupIssueCollector } from "./backupIssueCollector";
import type { GroupCalendar, GroupCalendarEvent, GroupCalendarsDocument } from "./groupCalendarTypes";
import { calendarRestrictsPeriodUpdate } from "./groupCalendars";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";

interface CalendarState { calendar: GroupCalendar; trustedPeriod: boolean }
const targetKey = (entity: "year" | "term", id: string) => JSON.stringify([entity, id]);
const calendarKeys = (calendar: GroupCalendar) => [targetKey("year", calendar.period.year.id), targetKey("term", calendar.period.term.id)];

/** Decoded selected sources only. Creation is not an update and never gains a new calendar restriction. */
export async function inspectArchivedAcademicPeriodCalendars(periods: AcademicPeriodsDocument, calendars: GroupCalendarsDocument | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим запретам изменения учебных периодов"), budget = createBackupBudget();
  let work = 0, updates = 0, checked = 0, blocked = 0, unconfirmed = 0, unconfigured = 0;
  const step = async (count = 1) => {
    const before = work; work += count;
    if (work > BACKUP_LIMITS.nodes) throw new Error("Сверка изменений учебных периодов с календарями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(work / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId: string, referenceId?: string) => add({ kind: "periods", level, code, message, recordId, ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    if (periods.history.length > BACKUP_LIMITS.records) throw new Error("Событий учебных периодов для сверки календарей больше 25 000. Частичный результат не создан.");
    let hasUpdates = false;
    for (const event of periods.history) { await step(); if (event.action === "updated") hasUpdates = true; }
    if (!hasUpdates) return { issues, summary: "Исторические запреты изменения учебных периодов: событий изменения нет. Создание года или семестра не запрещается закрытием другого периода; полномочия этим не подтверждены." };
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница проверки исторических запретов изменения учебных периодов.");
    const events = calendars?.history ?? [];
    if (events.length > BACKUP_LIMITS.records) throw new Error("Событий календарей для сверки учебных периодов больше 25 000. Частичный результат не создан.");
    await step(periods.history.length);
    const lookup = createAssessmentPeriodHistoryLookup(periods), ties = new Map<string, GroupCalendarEvent[]>();
    let previous = -Infinity;
    for (const event of events) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок истории календарей для сверки учебных периодов.");
      previous = time;
      const keys = new Set([...calendarKeys(event.after), ...(event.before ? calendarKeys(event.before) : [])]);
      for (const target of keys) {
        await step(); const key = JSON.stringify([time, target]), rows = ties.get(key) ?? [];
        if (!ties.has(key)) addBackupText(budget, key);
        rows.push(event); ties.set(key, rows);
      }
    }
    const current = new Map<string, CalendarState>(), byTarget = new Map<string, Map<string, CalendarState>>();
    let position = 0; previous = -Infinity;
    for (const event of periods.history) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок истории учебных периодов. Частичная сверка не создана.");
      previous = time;
      if (event.action !== "updated") continue;
      updates++;
      if (time > cutoff) {
        unconfirmed++; finding("review", "unchecked-period-calendar-time", "Изменение учебного периода датировано позже границы проверки. Историческое закрытие для этого события не подтверждалось.", event.id); continue;
      }
      if (!calendars) {
        unconfirmed++; finding("review", "unchecked-period-calendar-source", "Полный согласованный источник календарей отсутствует. Запрет изменения закрытого учебного года или семестра на момент события не проверен; живые данные не подставлялись.", event.id); continue;
      }
      while (position < events.length && Date.parse(events[position].occurredAt) < time) {
        await step(); const change = events[position++], before = current.get(change.after.id);
        if (before) for (const key of calendarKeys(before.calendar)) { await step(); byTarget.get(key)?.delete(change.after.id); }
        const state = { calendar: change.after, trustedPeriod: lookup(change.after.period, change.occurredAt) };
        if (!before) addBackupText(budget, change.after.id);
        current.set(change.after.id, state);
        for (const key of calendarKeys(change.after)) {
          await step(); const states = byTarget.get(key) ?? new Map<string, CalendarState>();
          if (!byTarget.has(key)) addBackupText(budget, key);
          states.set(change.after.id, state); byTarget.set(key, states);
        }
      }
      const target = targetKey(event.entity, event.after.id), ambiguous = new Set<string>();
      let unknown = false, forbidden = false, relevant = false;
      for (const change of ties.get(JSON.stringify([time, target])) ?? []) {
        await step(); ambiguous.add(change.after.id); unknown = true;
        finding("review", "ambiguous-period-calendar-order", "Изменение учебного года или семестра и затрагивающий его календарь имеют одинаковое время в разных документах. Общий порядок закрытия или переоткрытия не восстановлен по ID и позиции списка.", event.id, change.after.id);
      }
      for (const state of byTarget.get(target)?.values() ?? []) {
        await step(); if (ambiguous.has(state.calendar.id)) continue;
        relevant = true;
        if (!state.trustedPeriod) {
          unknown = true; finding("review", "unchecked-period-calendar-snapshot", "Снимок года и семестра календаря не подтверждён согласованной историей периодов на момент его сохранения. По нему не выдано разрешение или запрет изменения справочника.", event.id, state.calendar.id); continue;
        }
        if (calendarRestrictsPeriodUpdate(state.calendar, event.entity, event.after.id)) {
          forbidden = true; finding("error", "period-calendar-restriction", "По однозначной истории календарь группы был закрыт на момент изменения связанного учебного года или семестра. Позднее переоткрытие не снимает замечание; реквизиты периода не изменялись.", event.id, state.calendar.id);
        }
      }
      if (forbidden) blocked++; if (unknown) unconfirmed++; else if (relevant) checked++; else unconfigured++;
    }
    checkBackupAbort(signal);
    return { issues, summary: `Исторические запреты изменения учебных периодов: событий изменения ${updates}; сверено по календарям ${checked}; с известным запретом ${blocked}; без связанного календаря ${unconfigured}; не подтверждено ${unconfirmed}. Связь определяется точным ID года или семестра во всех группах, без сравнения названий и диапазонов дат. Создание не получает нового запрета; исторические полномочия и восстановление не подтверждены.` };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось сверить изменения учебных лет и семестров с историческим закрытием календарей:", error);
    throw error;
  }
}
