import type { AssessmentDocument } from "./assessmentTypes";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import { createAssessmentPeriodHistoryLookup } from "./assessmentPeriods";
import type { GroupCalendar, GroupCalendarEvent, GroupCalendarsDocument } from "./groupCalendarTypes";
import { calendarRestrictsEditing } from "./groupCalendars";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import { createBackupIssueCollector } from "./backupIssueCollector";

interface CalendarState { calendar: GroupCalendar; trustedPeriod: boolean }
interface AttemptDate { date: string | null }

/** Strictly decoded documents only. Calendar changes do not retroactively alter saved assessment operations. */
export async function inspectArchivedAssessmentCalendars(document: AssessmentDocument, calendars: GroupCalendarsDocument | undefined, periods: AcademicPeriodsDocument | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("историческим календарям ведомостей"), budget = createBackupBudget();
  let work = 0, checked = 0, blocked = 0, unconfirmed = 0, unconfigured = 0;
  const step = async (count = 1) => {
    const before = work; work += count;
    if (work > BACKUP_LIMITS.nodes) throw new Error("Сверка ведомостей с календарями превышает предел операций. Частичный результат не создан.");
    if (Math.floor(before / 128) !== Math.floor(work / 128)) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId: string, referenceId?: string) => add({ kind: "assessments", level, code, message, recordId, ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определён момент завершения проверки календарей ведомостей.");
    for (const rows of [document.assessments, document.history, document.corrections, document.correctionHistory, calendars?.history ?? [], periods?.history ?? []]) {
      if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник календарей ведомостей превышает предел 25 000 записей. Частичный результат не создан.");
    }
    if (document.history.length + document.correctionHistory.length > BACKUP_LIMITS.records) throw new Error("Событий ведомостей для сверки календарей больше 25 000. Частичный результат не создан.");
    await step(periods?.history.length ?? 0);
    const lookup = periods && createAssessmentPeriodHistoryLookup(periods);
    const assessments = new Map<string, { groupId: string; termId?: string; untrustedTerm: boolean }>();
    const dates = new Map<string, Map<string, AttemptDate>>();
    let attempts = 0;
    for (const assessment of document.assessments) {
      await step(); attempts += assessment.attempts.length;
      if (attempts > BACKUP_LIMITS.records) throw new Error("Ведомостей для сверки календарей больше 25 000. Частичный результат не создан.");
      const trusted = !assessment.academicPeriod || Boolean(lookup?.(assessment.academicPeriod, assessment.attempts[0].createdAt));
      assessments.set(assessment.id, { groupId: assessment.groupId, ...(trusted && assessment.academicPeriod ? { termId: assessment.academicPeriod.term.id } : {}), untrustedTerm: !trusted });
      dates.set(assessment.id, new Map()); addBackupText(budget, assessment.id);
    }
    const corrections = new Map<string, { assessmentId: string; attemptId: string }>();
    for (const correction of document.corrections) {
      await step(); corrections.set(correction.id, { assessmentId: correction.assessmentId, attemptId: correction.attemptId });
      addBackupText(budget, correction.id);
    }
    const events = calendars?.history ?? [], ties = new Map<string, GroupCalendarEvent[]>();
    let previous = -Infinity;
    for (const event of events) {
      await step(); const time = Date.parse(event.occurredAt);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок событий календарей. Частичная сверка ведомостей не создана.");
      previous = time;
      const key = JSON.stringify([time, event.after.group.id]), rows = ties.get(key) ?? [];
      if (!ties.has(key)) addBackupText(budget, key);
      rows.push(event); ties.set(key, rows);
    }
    const operations: ({ stream: "assessment"; event: AssessmentDocument["history"][number]; time: number; index: number } | { stream: "correction"; event: AssessmentDocument["correctionHistory"][number]; time: number; index: number })[] = [];
    for (const [index, event] of document.history.entries()) { await step(); operations.push({ stream: "assessment", event, time: Date.parse(event.occurredAt), index }); }
    for (const [index, event] of document.correctionHistory.entries()) { await step(); operations.push({ stream: "correction", event, time: Date.parse(event.occurredAt), index }); }
    if (operations.some(operation => !Number.isFinite(operation.time))) throw new Error("В истории ведомостей нет корректного времени события.");
    // A correction requires a published, immutable assignment. Equal-time regular events cannot change its date.
    operations.sort((a, b) => a.time - b.time || (a.stream === b.stream ? a.index - b.index : a.stream === "assessment" ? -1 : 1));
    const active = new Map<string, Map<string, CalendarState>>();
    let position = 0;
    for (const operation of operations) {
      await step();
      const event = operation.event, correction = operation.stream === "correction" ? corrections.get(operation.event.correctionId) : undefined;
      const assessmentId = operation.stream === "assessment" ? operation.event.assessmentId : correction?.assessmentId;
      const attemptId = operation.stream === "assessment" ? operation.event.attemptId : correction?.attemptId;
      const assessment = assessmentId && assessments.get(assessmentId), current = assessmentId && dates.get(assessmentId);
      if (!assessment || !current || !attemptId) throw new Error("Не разрешена точная связь события ведомости для проверки календаря.");
      const id = JSON.stringify([operation.stream === "assessment" ? "assessment-history" : "assessment-correction-history", event.id]);
      let affected: AttemptDate[];
      if (operation.stream === "assessment") {
        const entry = operation.event, before = current.get(attemptId);
        if (entry.assignment) {
          const next = { date: entry.assignmentOrigin === "legacy-snapshot" ? null : entry.assignment.date };
          current.set(attemptId, next); if (!before) addBackupText(budget, attemptId);
        }
        const after = current.get(attemptId);
        if (!after) throw new Error("Нет явного назначения ведомости в истории. Текущая дата не подставлялась.");
        // The store checks every existing attempt for whole-assessment commands, including closed statements.
        affected = entry.action === "record-book-updated" || entry.action === "supervisor-changed" ? [...current.values()]
          : entry.action === "attempt-updated" ? [before ?? { date: null }, after] : [after];
      } else {
        const assigned = current.get(attemptId);
        if (!assigned) throw new Error("Назначение исправляемой ведомости не подтверждено историей.");
        affected = [assigned];
      }
      await step(affected.length);
      const unknownDate = affected.some(value => value.date === null), knownDates = [...new Set(affected.flatMap(value => value.date === null ? [] : [value.date]))];
      if (operation.time > cutoff) {
        unconfirmed++; finding("review", "unchecked-assessment-calendar-time", "Событие датировано позже границы проверки. Историческое состояние календаря для него не подтверждалось.", id); continue;
      }
      if (!calendars) {
        unconfirmed++; finding("review", "unchecked-assessment-calendar-source", "Полный согласованный источник календарей отсутствует. Проверка закрытого периода для операции ведомости не выполнена; текущие данные не подставлялись.", id); continue;
      }
      while (position < events.length && Date.parse(events[position].occurredAt) < operation.time) {
        await step(); const change = events[position++], groupId = change.after.group.id;
        const states = active.get(groupId) ?? new Map<string, CalendarState>();
        states.set(change.after.id, { calendar: change.after, trustedPeriod: Boolean(lookup?.(change.after.period, change.occurredAt)) }); active.set(groupId, states);
      }
      let unknown = unknownDate || assessment.untrustedTerm, forbidden = false, relevant = false;
      if (unknown) finding("review", "unchecked-assessment-calendar-assignment", "Первоначальная дата назначения или снимок периода не подтверждены независимой историей. Дата позднего снимка и текстовое название периода не использовались для разрешения операции.", id, attemptId);
      const touches = (calendar: GroupCalendar) => unknownDate || assessment.untrustedTerm || calendar.period.term.id === assessment.termId || knownDates.some(date => date >= calendar.period.term.startsOn && date <= calendar.period.term.endsOn);
      const ambiguous = new Set<string>();
      for (const change of ties.get(JSON.stringify([operation.time, assessment.groupId])) ?? []) {
        await step(knownDates.length * 2 + 1);
        if (!touches(change.after) && !(change.before && touches(change.before))) continue;
        ambiguous.add(change.after.id); unknown = true;
        finding("review", "ambiguous-assessment-calendar-order", "Операция ведомости и затрагивающее период изменение календаря имеют одинаковое время в разных документах. Общий порядок не восстановлен по ID или позиции списка.", id, change.after.id);
      }
      for (const state of active.get(assessment.groupId)?.values() ?? []) {
        await step(knownDates.length * 2 + 1);
        if (ambiguous.has(state.calendar.id)) continue;
        if (!state.trustedPeriod) {
          unknown = true; finding("review", "unchecked-assessment-calendar-period", "Снимок семестра календаря не подтверждён согласованной историей периодов. По нему не выдано разрешение или запрет операции ведомости.", id, state.calendar.id); continue;
        }
        if (!touches(state.calendar)) continue;
        relevant = true;
        if (calendarRestrictsEditing(state.calendar, assessment.groupId, knownDates, assessment.termId)) {
          forbidden = true; finding("error", "assessment-calendar-restriction", "На момент операции ведомости однозначное сохранённое состояние календаря запрещало редактирование закрытого периода. Последующее переоткрытие не отменяет это замечание; результаты и даты не изменялись.", id, state.calendar.id);
        }
      }
      if (forbidden) blocked++; if (unknown) unconfirmed++; else if (relevant) checked++; else unconfigured++;
    }
    checkBackupAbort(signal);
    return { issues, summary: `Исторические календари ведомостей: событий ${operations.length}; сверено по календарю ${checked}; с известным запретом ${blocked}; без затрагивающей настройки ${unconfigured}; не подтверждено ${unconfirmed}. Проверяется только действующий запрет закрытого периода, без нового запрета по праздникам и каникулам. Полномочия авторов и восстановление не подтверждены.` };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось сверить операции ведомостей с историческими календарями групп:", error);
    throw error;
  }
}
