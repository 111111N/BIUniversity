import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import { createBackupIssueCollector } from "./backupIssueCollector";
import type { GroupCalendar, GroupCalendarEvent, GroupCalendarsDocument } from "./groupCalendarTypes";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import { calendarRestrictsTeachingChange, getTeachingCalendarChange } from "./teachingCalendarRules";
import type { TeachingAssignmentsDocument } from "./teachingAssignments";

interface CalendarState { calendar: GroupCalendar; trustedPeriod: boolean }
const scopeKey = (groupId: string, termId: string | null) => JSON.stringify([groupId, termId]);
const calendarKeys = (calendar: GroupCalendar) => [scopeKey(calendar.group.id, null), scopeKey(calendar.group.id, calendar.period.term.id)];

/** Decoded sources only. Historical mode and period snapshots are never inferred from today's assignment. */
export async function inspectArchivedTeachingCalendars(document: TeachingAssignmentsDocument, calendars: GroupCalendarsDocument | undefined, periods: AcademicPeriodsDocument | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим календарям назначений преподавателей"), budget = createBackupBudget();
  let work = 0, changes = 0, modeChanges = 0, checked = 0, blocked = 0, unconfigured = 0, unconfirmed = 0, unrestricted = 0;
  const step = async (count = 1) => {
    const before = work; work += count;
    if (work > BACKUP_LIMITS.nodes) throw new Error("Сверка назначений преподавателей с календарями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(work / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId: string, referenceId?: string) => add({ kind: "teachingAssignments", level, code, message, recordId, ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    for (const rows of [document.history, calendars?.history ?? [], periods?.history ?? []]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник календарной сверки назначений преподавателей превышает 25 000 событий. Частичный результат не создан.");
    if (!document.history.length) return { issues, summary: "Исторические календари назначений преподавателей: событий нет. Исторические права и восстановление этим не подтверждены." };
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница проверки исторических календарей назначений преподавателей.");
    await step(periods?.history.length ?? 0);
    const lookup = periods && createAssessmentPeriodHistoryLookup(periods), events = calendars?.history ?? [];
    const ties = new Map<string, GroupCalendarEvent[]>();
    let previousTime = -Infinity;
    for (const event of events) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previousTime) throw new Error("Нарушен порядок календарей для проверки назначений преподавателей.");
      previousTime = time;
      const scopes = new Set([...calendarKeys(event.after), ...(event.before ? calendarKeys(event.before) : [])]);
      for (const scope of scopes) {
        await step(); const key = JSON.stringify([time, scope]), rows = ties.get(key) ?? [];
        if (!ties.has(key)) addBackupText(budget, key);
        rows.push(event); ties.set(key, rows);
      }
    }
    const current = new Map<string, CalendarState>(), byScope = new Map<string, Map<string, CalendarState>>();
    const assignmentTrust = new Map<string, Map<string, boolean>>();
    let position = 0; previousTime = -Infinity;
    for (const event of document.history) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previousTime) throw new Error("Нарушен порядок истории назначений преподавателей. Частичная сверка не создана.");
      previousTime = time; changes++;
      const priorTrust = assignmentTrust.get(event.after.id);
      if (event.before && !priorTrust) throw new Error("Прежнее назначение преподавателя не подтверждено цепочкой событий. Текущее назначение не подставлялось.");
      if (!priorTrust) addBackupText(budget, event.after.id);
      await step(((event.before?.periods.length ?? 0) + event.after.periods.length) * 3 + 1);
      const afterTrust = new Map<string, boolean>();
      for (const entry of event.after.periods) {
        addBackupText(budget, scopeKey(event.after.id, entry.period.term.id));
        afterTrust.set(entry.period.term.id, Boolean(lookup?.(entry.period, event.occurredAt)));
      }
      assignmentTrust.set(event.after.id, afterTrust);
      const change = getTeachingCalendarChange(event.before, event.after);
      if (change.modeChanged) modeChanges++;
      if (time > cutoff) {
        unconfirmed++; finding("review", "unchecked-teaching-calendar-time", "Изменение назначения преподавателя датировано позже границы проверки. Историческое закрытие для него не подтверждалось.", event.id); continue;
      }
      if (!change.modeChanged && !change.changedTermIds.size) { unrestricted++; continue; }
      if (!calendars) {
        unconfirmed++; finding("review", "unchecked-teaching-calendar-source", "Полный согласованный источник календарей отсутствует. Закрытие при изменении режима или семестров назначения преподавателя не проверено; другие источники не подставлялись.", event.id); continue;
      }
      while (position < events.length && Date.parse(events[position].occurredAt) < time) {
        await step(); const update = events[position++], before = current.get(update.after.id);
        if (before) for (const key of calendarKeys(before.calendar)) { await step(); byScope.get(key)?.delete(update.after.id); }
        const state = { calendar: update.after, trustedPeriod: Boolean(lookup?.(update.after.period, update.occurredAt)) };
        if (!before) addBackupText(budget, update.after.id);
        current.set(update.after.id, state);
        for (const key of calendarKeys(update.after)) {
          await step(); const states = byScope.get(key) ?? new Map<string, CalendarState>();
          if (!byScope.has(key)) addBackupText(budget, key);
          states.set(update.after.id, state); byScope.set(key, states);
        }
      }
      let unknown = false, forbidden = false, relevant = false;
      const ambiguous = new Set<string>();
      const scopes = change.modeChanged ? [scopeKey(change.groupId, null)] : [...change.changedTermIds].map(termId => scopeKey(change.groupId, termId));
      const confirmedTerms = new Map<string, boolean>();
      if (!change.modeChanged) for (const termId of change.changedTermIds) {
        // Maps include every saved period; an absent key means that this version has no such period.
        await step(); const confirmed = (priorTrust?.get(termId) ?? true) && (afterTrust.get(termId) ?? true);
        confirmedTerms.set(termId, confirmed);
        if (!confirmed) {
          unknown = true; finding("review", "unchecked-teaching-calendar-assignment-period", "Прежний или новый снимок семестра назначения не подтверждён историей справочника на момент сохранения соответствующей версии. Поздняя ревизия не подставлялась для подтверждения запрета.", event.id, termId);
        }
      }
      for (const scope of scopes) {
        await step();
        for (const update of ties.get(JSON.stringify([time, scope])) ?? []) {
          await step(); ambiguous.add(update.after.id); unknown = true;
          finding("review", "ambiguous-teaching-calendar-order", "Изменение назначения преподавателя и затрагивающего его календаря имеют одинаковое время в разных документах. Порядок закрытия или переоткрытия не восстановлен по ID и позиции списка.", event.id, update.after.id);
        }
      }
      for (const scope of scopes) {
        await step();
        for (const state of byScope.get(scope)?.values() ?? []) {
          await step(); if (ambiguous.has(state.calendar.id)) continue;
          relevant = true;
          if (!state.trustedPeriod) {
            unknown = true; finding("review", "unchecked-teaching-calendar-period", "Снимок периода календаря не подтверждён согласованной историей на момент его сохранения. По нему не выдано разрешение или запрет изменения назначения преподавателя.", event.id, state.calendar.id); continue;
          }
          if ((change.modeChanged || confirmedTerms.get(state.calendar.period.term.id)) && calendarRestrictsTeachingChange(state.calendar, change)) {
            forbidden = true; finding("error", "teaching-calendar-restriction", "По однозначной истории календарь группы был закрыт на момент изменения назначения преподавателя. Действующее правило запрещало смену режима либо изменение соответствующего семестра назначения. Позднее переоткрытие не снимает замечание; назначение не изменялось.", event.id, state.calendar.id);
          }
        }
      }
      if (forbidden) blocked++; if (unknown) unconfirmed++; else if (relevant) checked++; else unconfigured++;
    }
    checkBackupAbort(signal);
    return { issues, summary: `Исторические календари назначений преподавателей: событий ${changes}; смен режима ${modeChanges}; без изменения режима и семестров ${unrestricted}; сверено по календарям ${checked}; с известным запретом ${blocked}; без связанного календаря ${unconfigured}; не подтверждено ${unconfirmed}. Смена режима проверяется по всем календарям группы, остальные изменения — по точным ID семестров. Общие назначения учёток, исторические права, защита будущих публикаций и восстановление этим не подтверждены.` };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось сверить назначения преподавателей с историческим закрытием календарей:", error);
    throw error;
  }
}
