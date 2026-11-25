import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import { createBackupIssueCollector } from "./backupIssueCollector";
import { calendarRestrictsCurriculumBinding, getCurriculumBindingCalendarChange } from "./curriculumCalendarRules";
import type { CurriculaDocument } from "./curriculumTypes";
import type { GroupCalendar, GroupCalendarEvent, GroupCalendarsDocument } from "./groupCalendarTypes";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";

interface CalendarState { calendar: GroupCalendar; trustedPeriod: boolean }
const scopeKey = (groupId: string, termId: string) => JSON.stringify([groupId, termId]);
const calendarKey = (calendar: GroupCalendar) => scopeKey(calendar.group.id, calendar.period.term.id);

/** Full decoded sources only. An event's previous binding, not the group's current plan, defines protected terms. */
export async function inspectArchivedCurriculumCalendars(document: CurriculaDocument, calendars: GroupCalendarsDocument | undefined, periods: AcademicPeriodsDocument | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим календарям назначений учебных планов"), budget = createBackupBudget();
  let work = 0, bindings = 0, protectedChanges = 0, unrestricted = 0, checked = 0, blocked = 0, unconfigured = 0, unconfirmed = 0;
  const step = async (count = 1) => {
    const before = work; work += count;
    if (work > BACKUP_LIMITS.nodes) throw new Error("Сверка назначений учебных планов с календарями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(work / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId: string, referenceId?: string) => add({ kind: "curricula", level, code, message, recordId, ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    for (const rows of [document.history, calendars?.history ?? [], periods?.history ?? []]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник календарной сверки назначений планов превышает предел 25 000 событий. Частичный результат не создан.");
    let hasBindings = false;
    for (const event of document.history) { await step(); if (event.entity === "binding") hasBindings = true; }
    if (!hasBindings) return { issues, summary: "Исторические календари назначений планов: событий назначения нет. Создание и правки карточек планов не получают нового календарного запрета; полномочия этим не подтверждены." };
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница проверки исторических календарей назначений планов.");
    await step(periods?.history.length ?? 0);
    const lookup = periods && createAssessmentPeriodHistoryLookup(periods), events = calendars?.history ?? [];
    const ties = new Map<string, GroupCalendarEvent[]>();
    let previousTime = -Infinity;
    for (const event of events) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previousTime) throw new Error("Нарушен порядок календарей для проверки назначений планов.");
      previousTime = time;
      const scopes = new Set([calendarKey(event.after), ...(event.before ? [calendarKey(event.before)] : [])]);
      for (const scope of scopes) {
        await step(); const key = JSON.stringify([time, scope]), rows = ties.get(key) ?? [];
        if (!ties.has(key)) addBackupText(budget, key);
        rows.push(event); ties.set(key, rows);
      }
    }
    const current = new Map<string, CalendarState>(), byScope = new Map<string, Map<string, CalendarState>>();
    const bindingTrust = new Map<string, Map<string, boolean>>();
    let position = 0; previousTime = -Infinity;
    for (const event of document.history) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previousTime) throw new Error("Нарушен порядок истории учебных планов. Частичная календарная сверка не создана.");
      previousTime = time; if (event.entity !== "binding") continue;
      bindings++;
      const groupId = event.after.group.id, priorTrust = bindingTrust.get(groupId);
      if (event.before && !priorTrust) throw new Error("Прежнее назначение плана не подтверждено цепочкой событий. Текущее назначение группы не подставлялось.");
      if (!priorTrust) addBackupText(budget, groupId);
      await step((event.before?.periods.length ?? 0) + event.after.periods.length * 2);
      const afterTrust = new Map<string, boolean>();
      for (const entry of event.after.periods) {
        addBackupText(budget, scopeKey(groupId, entry.period.term.id));
        afterTrust.set(entry.period.term.id, Boolean(lookup?.(entry.period, event.occurredAt)));
      }
      bindingTrust.set(groupId, afterTrust);
      const change = getCurriculumBindingCalendarChange(groupId, event.before, event.after.planId, event.after.periods.map(entry => ({ semester: entry.semester, termId: entry.period.term.id })));
      if (change.protectedTermIds.size) protectedChanges++;
      if (time > cutoff) {
        unconfirmed++; finding("review", "unchecked-curriculum-calendar-time", "Назначение плана датировано позже границы проверки. Историческое закрытие для него не подтверждалось.", event.id); continue;
      }
      if (!change.protectedTermIds.size) { unrestricted++; continue; }
      if (!calendars) {
        unconfirmed++; finding("review", "unchecked-curriculum-calendar-source", "Полный согласованный источник календарей отсутствует. Закрытие при смене плана или прежнего соответствия семестра периоду не проверено; другой источник не подставлялся.", event.id); continue;
      }
      while (position < events.length && Date.parse(events[position].occurredAt) < time) {
        await step(); const update = events[position++], before = current.get(update.after.id);
        if (before) byScope.get(calendarKey(before.calendar))?.delete(update.after.id);
        const state = { calendar: update.after, trustedPeriod: Boolean(lookup?.(update.after.period, update.occurredAt)) }, key = calendarKey(update.after);
        if (!before) addBackupText(budget, update.after.id);
        current.set(update.after.id, state);
        const states = byScope.get(key) ?? new Map<string, CalendarState>();
        if (!byScope.has(key)) addBackupText(budget, key);
        states.set(update.after.id, state); byScope.set(key, states);
      }
      let unknown = false, forbidden = false, relevant = false;
      const ambiguous = new Set<string>();
      for (const termId of change.protectedTermIds) {
        await step(); const key = scopeKey(groupId, termId);
        if (!priorTrust?.get(termId)) {
          unknown = true; finding("review", "unchecked-curriculum-calendar-previous-period", "Снимок периода прежнего назначения не подтверждён историей справочника на момент сохранения того назначения. Поздняя ревизия и текущий план не использовались для подтверждения запрета.", event.id, termId);
        }
        for (const update of ties.get(JSON.stringify([time, key])) ?? []) {
          await step(); ambiguous.add(update.after.id); unknown = true;
          finding("review", "ambiguous-curriculum-calendar-order", "Изменение назначения и затрагивающего прежний семестр календаря имеют одинаковое время в разных документах. Порядок закрытия или переоткрытия не восстановлен по ID или позиции списка.", event.id, update.after.id);
        }
      }
      for (const termId of change.protectedTermIds) {
        await step();
        for (const state of byScope.get(scopeKey(groupId, termId))?.values() ?? []) {
          await step(); if (ambiguous.has(state.calendar.id)) continue;
          relevant = true;
          if (!state.trustedPeriod) {
            unknown = true; finding("review", "unchecked-curriculum-calendar-period", "Снимок периода календаря не подтверждён согласованной историей на момент его сохранения. По нему не выдано разрешение или запрет изменения назначения.", event.id, state.calendar.id); continue;
          }
          if (priorTrust?.get(termId) && calendarRestrictsCurriculumBinding(state.calendar, change)) {
            forbidden = true; finding("error", "curriculum-calendar-restriction", "На момент изменения назначения календарь прежнего семестра группы был закрыт. Действующее правило запрещало смену плана либо удаление или перенос прежнего соответствия семестра периоду. Позднее переоткрытие не снимает замечание; назначение не изменялось.", event.id, state.calendar.id);
          }
        }
      }
      if (forbidden) blocked++; if (unknown) unconfirmed++; else if (relevant) checked++; else unconfigured++;
    }
    checkBackupAbort(signal);
    return { issues, summary: `Исторические календари назначений планов: событий ${bindings}; затрагивают прежние соответствия ${protectedChanges}; без затрагивания прежних соответствий ${unrestricted}; сверено по календарям ${checked}; с известным запретом ${blocked}; без связанного календаря ${unconfigured}; не подтверждено ${unconfirmed}. Первое назначение и добавление новых семестров не получают нового запрета. Текущий план не заменяет историю; полномочия, программа группы и восстановление не подтверждены.` };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось сверить изменения назначений учебных планов с историческим закрытием календарей:", error);
    throw error;
  }
}
