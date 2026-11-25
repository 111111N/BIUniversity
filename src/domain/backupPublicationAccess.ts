import type { AccountsDocument } from "./accounts";
import type { CoherentAccountHistoryContext } from "./backupAccountHistory";
import { createArchivedAccountAccessLookup } from "./backupAccountAccessLookup";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import { checkBackupAbort } from "./localBackup";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";

/** Saved contradictions only. Creation/current status never supplies an unsaved historical access state. */
export async function inspectArchivedPublicationAccess(document: AccountsDocument, schedule: ManagedScheduleSnapshot | undefined, context: CoherentAccountHistoryContext, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("сохранённым условиям доступа публикаций"), work = createBackupInspectionWork("условий доступа публикаций", signal);
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind: "schedule", level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    await work.step(0);
    if (context.source !== document) throw new Error("Подготовленные роли и состояния доступа относятся к другому полному источнику учёток.");
    for (const count of [document.accounts.length, document.history.length, context.coherentAccounts.size, context.histories.size, schedule?.publications?.length ?? 0]) work.assertRecords(count);
    const publications = schedule?.publications ?? [];
    if (!publications.length) {
      if (document.history.length) finding("review", "unchecked-publication-access-history", "История публикаций отсутствует или пуста; прежние условия входа и роли не определялись по текущему расписанию.");
      return { issues, summary: "Условия доступа публикаций: архивных версий нет; текущее состояние не подставлялось в прошлое." };
    }
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница проверки сохранённых условий доступа публикаций.");
    const stateAt = await createArchivedAccountAccessLookup(document, context, work, (point, item) => add({ kind: point.kind, recordId: point.recordId, ...item }), signal);
    let principals = 0, roleDenials = 0, blocks = 0, unknown = 0, ties = 0, copies = 0, baselines = 0, future = 0;
    const checkPrincipal = async (id: string, mode: "publisher" | "teacher", publicationId: string, time: number) => {
      await work.step(); principals++; const state = await stateAt(id, time, { kind: "schedule", recordId: publicationId });
      const required = mode === "publisher" ? "configurator" : "teacher";
      if (state && !state.roleTie && state.role !== undefined && state.role !== required) {
        roleDenials++;
        finding("error", mode === "publisher" ? "publication-author-role-not-allowed" : "publication-teacher-role-not-allowed", mode === "publisher" ? "Сохранённая роль автора перед публикацией не допускает работу настройщика с расписанием по действующему правилу." : "Сохранённая роль учётки перед публикацией не допускает её выбор преподавателем занятия по действующему правилу.", publicationId, id);
      }
      if (state && !state.statusTie && state.access === "blocked") {
        blocks++;
        finding("error", mode === "publisher" ? "publication-author-blocked" : "publication-teacher-blocked", mode === "publisher" ? "Перед публикацией сохранён явный снимок блокировки автора. Действующее правило требует активную учётку настройщика." : "Перед публикацией сохранён явный снимок блокировки преподавателя. Действующее правило исключает такую учётку из доступных преподавателей.", publicationId, id);
      }
      if (state?.roleTie || state?.statusTie) ties++;
      if (!state || state.role === undefined || state.access === undefined || state.roleTie || state.statusTie) {
        unknown++;
        finding("review", "unconfirmed-publication-account-access", "Сохранённая история не определяет все условия роли и входа в момент публикации либо время изменения совпадает с публикацией. Текущая роль/активность и начальная активность при создании не подставлялись.", publicationId, JSON.stringify([mode, id]));
      }
    };
    const baselineIds = new Set<string>(); let previousTime = -Infinity;
    for (const publication of publications) {
      await work.step(); const time = Date.parse(publication.occurredAt);
      if (!Number.isFinite(time) || time < previousTime) throw new Error("Нарушен порядок публикаций при проверке сохранённых условий доступа.");
      previousTime = time; work.assertRecords(publication.week.lessons.length);
      if (time <= cutoff && publication.origin === "published") await checkPrincipal(publication.actorId, "publisher", publication.id, time);
      const ids = new Set<string>();
      for (const lesson of publication.week.lessons) {
        work.assertRecords(++copies); await work.step();
        if (ids.has(lesson.id) || publication.origin === "saved-snapshot" && baselineIds.has(lesson.id)) throw new Error("Версия публикации или общий начальный снимок содержат повторяющийся ID занятия. Частичная проверка доступа не создана.");
        ids.add(lesson.id); if (publication.origin === "saved-snapshot") baselineIds.add(lesson.id);
        if (time <= cutoff && publication.origin === "published") await checkPrincipal(lesson.teacherId, "teacher", publication.id, time);
      }
      if (time > cutoff) { future++; finding("review", "unchecked-publication-access-after-cutoff", "Публикация позже границы архива не подтверждает прежние условия роли и доступа.", publication.id); }
      else if (publication.origin === "saved-snapshot") { baselines++; finding("review", "unconfirmed-baseline-publication-access", "Начальный снимок не подтверждает роль и состояние входа при исходной публикации. Состояние на дату захвата не подставлялось в прошлое.", publication.id); }
    }
    const summary = `Условия доступа публикаций: сопоставлений учёток ${principals}; несовместимых ролей ${roleDenials}; явных блокировок ${blocks}; неподтверждённых условий ${unknown}; равных времён ${ties}; начальных снимков ${baselines}; публикаций после границы ${future}. Это внутренние условия сохранённых ролей/статусов, а не подтверждение внешнего происхождения и всех полномочий.`;
    finding("review", "unconfirmed-publication-access-authority", summary);
    checkBackupAbort(signal); return { issues, summary };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить сохранённые условия роли и входа исторических публикаций:", error);
    throw error;
  }
}
