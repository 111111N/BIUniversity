import type { AccountsDocument } from "./accounts";
import { createArchivedAccountAccessLookup, type AccessHistoryPoint } from "./backupAccountAccessLookup";
import type { CoherentAccountHistoryContext } from "./backupAccountHistory";
import type { ArchivedAuthorSources } from "./backupActorChronology";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentKind } from "./localBackupDocuments";
import { isCanonicalBackupInstant } from "./backupHistoryTime";

interface Action { id: string; actorId: string; occurredAt: string; origin?: string }
interface History { kind: BackupDocumentKind; tag: string; events: readonly Action[] }
interface Query extends AccessHistoryPoint { actorId: string; time: number }

/** Query order is internal only: original source histories are never reordered or given an interdocument order. */
export async function inspectArchivedAdministrativeAccess(document: AccountsDocument, sources: ArchivedAuthorSources, context: CoherentAccountHistoryContext, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("сохранённым условиям административных действий"), work = createBackupInspectionWork("условий административных действий", signal);
  const finding = (point: AccessHistoryPoint, level: "error" | "review", code: string, message: string, referenceId?: string) => add({ kind: point.kind, recordId: point.recordId, level, code, message, ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    await work.step(0);
    if (context.source !== document || sources.accounts && sources.accounts !== document) throw new Error("Условия административного доступа относятся к другому полному источнику учёток.");
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff) || !isCanonicalBackupInstant(completedAt)) throw new Error("Не определена точная граница проверки административных действий.");
    const histories: History[] = [
      { kind: "groups", tag: "group-history", events: sources.groups?.history ?? [] },
      { kind: "subjects", tag: "subject-history", events: sources.subjects?.history ?? [] },
      { kind: "periods", tag: "period-history", events: sources.periods?.history ?? [] },
      { kind: "educationDirectories", tag: "directory-history", events: sources.directories?.history ?? [] },
      { kind: "curricula", tag: "curriculum-history", events: sources.curricula?.history ?? [] },
      { kind: "groupCalendars", tag: "calendar-history", events: sources.calendars?.history ?? [] },
      { kind: "teachingAssignments", tag: "teaching-history", events: sources.teaching?.history ?? [] },
      { kind: "rooms", tag: "room-history", events: sources.rooms?.history ?? [] },
      { kind: "scheduleTemplates", tag: "template-history", events: sources.templates?.history ?? [] },
    ];
    const queries: Query[] = [];
    let visited = 0, baselines = 0, future = 0, uncertainDates = 0;
    for (const source of histories) {
      work.assertRecords(source.events.length);
      for (const event of source.events) {
        work.assertRecords(++visited); await work.step();
        const point = { kind: source.kind, recordId: JSON.stringify([source.tag, event.id]) }, time = Date.parse(event.occurredAt);
        if (!Number.isFinite(time)) throw new Error("Административная история содержит некорректное время. Частичный результат не создан.");
        if (!isCanonicalBackupInstant(event.occurredAt)) { uncertainDates++; finding(point, "review", "unconfirmed-administrative-event-instant", "Старый формат даты не подтверждает канонический момент административного действия. Строгие условия доступа не определялись по условной полуночи.", event.actorId); }
        else if (time > cutoff) { future++; finding(point, "review", "unchecked-administrative-access-after-cutoff", "Действие позже границы архива не использовано для вывода о прежних условиях роли и входа.", event.actorId); }
        else if (source.kind === "subjects" && event.origin === "saved-snapshot") { baselines++; finding(point, "review", "unconfirmed-administrative-baseline-access", "Ранний сохранённый снимок не подтверждает полномочия при исходной операции. Условия при захвате не подставлялись в прошлое.", event.actorId); }
        else {
          work.addText(JSON.stringify([point.recordId, event.actorId]));
          queries.push({ ...point, actorId: event.actorId, time });
        }
      }
    }
    // Cooperative stable merge sort orders bounded metadata queries, not original actions.
    let ordered = queries, scratch = new Array<Query>(queries.length);
    for (let width = 1; width < ordered.length; width *= 2) {
      for (let start = 0; start < ordered.length; start += width * 2) {
        const middle = Math.min(start + width, ordered.length), end = Math.min(start + width * 2, ordered.length);
        let left = start, right = middle;
        for (let position = start; position < end; position++) {
          await work.step();
          scratch[position] = right >= end || left < middle && ordered[left].time <= ordered[right].time ? ordered[left++] : ordered[right++];
        }
      }
      [ordered, scratch] = [scratch, ordered];
    }
    const stateAt = await createArchivedAccountAccessLookup(document, context, work, (point, item) => add({ kind: point.kind, recordId: point.recordId, ...item }), signal);
    let roleDenials = 0, blocks = 0, unknown = 0, ties = 0;
    for (const query of ordered) {
      await work.step(); const state = await stateAt(query.actorId, query.time, query);
      if (state && !state.roleTie && state.role !== undefined && state.role !== "configurator") {
        roleDenials++;
        finding(query, "error", "administrative-actor-role-not-allowed", "Сохранённая роль автора на время действия не допускает управление этим разделом: действующее правило требует настройщика.", query.actorId);
      }
      if (state && !state.statusTie && state.access === "blocked") {
        blocks++;
        finding(query, "error", "administrative-actor-blocked", "Перед действием сохранён пригодный явный снимок блокировки автора. Действующее правило требует активную учётку настройщика.", query.actorId);
      }
      if (state?.roleTie || state?.statusTie) ties++;
      if (!state || state.role === undefined || state.access === undefined || state.roleTie || state.statusTie) {
        unknown++;
        finding(query, "review", "unconfirmed-administrative-actor-access", "Сохранённая история не определяет все условия роли/входа автора либо время чувствительного изменения совпадает с действием. Текущая роль и начальная активность не подставлялись.", query.actorId);
      }
    }
    const summary = `Административные условия доступа: действий ${visited}; сопоставлений ${ordered.length}; несовместимых ролей ${roleDenials}; явных блокировок ${blocks}; неподтверждённых условий ${unknown}; равных времён ${ties}; ранних снимков ${baselines}; действий после границы ${future}; нестандартных дат ${uncertainDates}. Проверены внутренние сохранённые условия, а не внешнее происхождение и весь набор полномочий.`;
    if (visited) add({ kind: "accounts", level: "review", code: "unconfirmed-administrative-access-authority", message: summary });
    checkBackupAbort(signal); return { issues, summary };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить сохранённые условия доступа авторов административных действий:", error);
    throw error;
  }
}
