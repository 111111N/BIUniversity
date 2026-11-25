import type { AcademicMembership, AccountChange, AccountsDocument, PortalAccount } from "./accounts";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import { checkBackupAbort } from "./localBackup";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { CoherentAccountHistoryContext } from "./backupAccountHistory";

type Effect = "snapshot" | "invalidate" | "none";
interface State { position: number; keys?: Set<string>; tieTime?: number; tied: boolean }
const scopeKey = (subjectId: string, groupId: string) => JSON.stringify([subjectId, groupId]);

/** Denials use explicit assignment snapshots in coherent saved chains; matches never establish full historical access. */
export async function inspectArchivedPublicationMemberships(document: AccountsDocument, schedule: ManagedScheduleSnapshot | undefined, context: CoherentAccountHistoryContext, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("общим назначениям исторических публикаций"), work = createBackupInspectionWork("общих назначений публикаций", signal);
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind: "schedule", level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    await work.step(0);
    if (context.source !== document) throw new Error("Подготовленные цепочки общих назначений относятся к другому источнику учёток. Проверка прервана.");
    work.assertRecords(context.coherentAccounts.size); work.assertRecords(context.histories.size);
    work.assertRecords(document.accounts.length); work.assertRecords(document.history.length);
    const publications = schedule?.publications ?? [];
    work.assertRecords(publications.length);
    if (!publications.length) {
      if (document.history.length) finding("review", "unchecked-publication-general-membership-history", "История публикаций отсутствует или пуста. Старые общие назначения не сопоставлялись с текущими карточками расписания.");
      return { issues, summary: "Общие назначения публикаций: архивных версий нет; текущее расписание не подставлялось в прошлое." };
    }
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница проверки общих назначений публикаций.");
    const states = new Map<string, State>(), effects = new Map<AccountChange, Effect>(), baselineIds = new Set<string>();
    const accounts = new Map<string, PortalAccount>(), sealed = new Map<string, boolean>(), snapshots = new Map<AccountChange, Set<string>>();
    for (const account of document.accounts) { await work.step(); work.addText(account.id); accounts.set(account.id, account); }
    const effectOf = async (event: AccountChange): Promise<Effect> => {
      const cached = effects.get(event); if (cached !== undefined) return cached;
      await work.step(); let effect: Effect = "none";
      if (event.action === "assignments-changed") effect = event.previousRole === "teacher" && event.nextRole === "teacher" ? "snapshot" : "invalidate";
      else if (event.action === "created" || event.action === "role-changed" || event.previousMemberships !== undefined || event.nextMemberships !== undefined) effect = "invalidate";
      else if (event.action === "details-changed") {
        work.assertRecords(event.changes?.length ?? 0);
        if (!event.changes?.length) effect = "invalidate";
        for (const change of event.changes ?? []) {
          await work.step();
          if (!["name", "login", "email", "scheduleName"].includes(change.field)) { effect = "invalidate"; break; }
        }
      } else if (event.action === "status-changed") {
        work.assertRecords(event.changes?.length ?? 0);
        if (!event.changes?.length) effect = "invalidate";
        for (const change of event.changes ?? []) { await work.step(); if (change.field !== "status") { effect = "invalidate"; break; } }
      } else if (event.action === "student-number-issued") {
        effect = "invalidate";
      }
      effects.set(event, effect); work.assertRecords(effects.size); return effect;
    };
    const keysOf = async (memberships: readonly AcademicMembership[]) => {
      work.assertRecords(memberships.length); const keys = new Set<string>();
      for (const membership of memberships) {
        await work.step(); work.assertRecords(membership.groupIds.length);
        for (const groupId of membership.groupIds) {
          await work.step(); const key = scopeKey(membership.subjectId, groupId);
          if (!keys.has(key)) work.addText(key); keys.add(key);
        }
      }
      return keys;
    };
    const sameKeys = async (left: ReadonlySet<string>, right: ReadonlySet<string>) => {
      if (left.size !== right.size) return false;
      for (const key of left) { await work.step(); if (!right.has(key)) return false; }
      return true;
    };
    const seal = async (teacherId: string, rows: readonly AccountChange[], publicationId: string) => {
      if (sealed.has(teacherId)) return sealed.get(teacherId)!;
      work.assertRecords(rows.length); let known: Set<string> | undefined;
      for (const event of rows) {
        await work.step(); const effect = await effectOf(event);
        if (effect === "invalidate") known = undefined;
        else if (effect === "snapshot") {
          if (!event.previousMemberships || !event.nextMemberships) throw new Error("В изменении назначений отсутствует полный снимок. Частичный результат не создан.");
          if (known && !await sameKeys(known, await keysOf(event.previousMemberships))) {
            sealed.set(teacherId, false);
            finding("review", "inconsistent-publication-membership-snapshots", "Явные снимки общих назначений не соединяются в сохранённую цепочку. Области занятий этой учётки не выводились из противоречивого источника.", publicationId, event.id);
            return false;
          }
          known = await keysOf(event.nextMemberships); snapshots.set(event, known);
        }
      }
      const account = accounts.get(teacherId);
      if (!account) throw new Error("Согласованная учётка отсутствует в подготовленном полном источнике.");
      if (known && !await sameKeys(known, await keysOf(account.memberships))) {
        sealed.set(teacherId, false);
        finding("review", "inconsistent-publication-membership-tail", "Последний пригодный снимок общих назначений расходится с текущей карточкой. Недостающее изменение и его дата не восстанавливались.", publicationId, teacherId);
        return false;
      }
      sealed.set(teacherId, true); return true;
    };
    let previousTime = -Infinity, copies = 0, checked = 0, excluded = 0, unknown = 0, ambiguous = 0, baselines = 0, future = 0;
    for (const publication of publications) {
      await work.step(); const time = Date.parse(publication.occurredAt);
      if (!Number.isFinite(time) || time < previousTime) throw new Error("Нарушен порядок публикаций при сверке общих назначений.");
      previousTime = time; work.assertRecords(publication.week.lessons.length);
      const ids = new Set<string>();
      for (const lesson of publication.week.lessons) {
        work.assertRecords(++copies); await work.step();
        if (ids.has(lesson.id) || publication.origin === "saved-snapshot" && baselineIds.has(lesson.id)) throw new Error("Версия публикации или общий начальный снимок содержат повторяющийся ID занятия. Частичная сверка общих назначений не создана.");
        ids.add(lesson.id); if (publication.origin === "saved-snapshot") baselineIds.add(lesson.id);
        if (time > cutoff || publication.origin === "saved-snapshot") continue;
        if (!context.coherentAccounts.has(lesson.teacherId)) {
          unknown++;
          finding("review", "unconfirmed-publication-membership-chain", "История учётки преподавателя не подтверждает согласованную цепочку от явного создания. Общие назначения не восстанавливались по текущему значению.", publication.id, lesson.teacherId);
          continue;
        }
        const rows = context.histories.get(lesson.teacherId);
        if (!rows?.length) throw new Error("Для согласованной учётки отсутствует подготовленная история назначений. Частичный результат не создан.");
        if (!await seal(lesson.teacherId, rows, publication.id)) { unknown++; continue; }
        const state: State = states.get(lesson.teacherId) ?? { position: 0, tied: false };
        if (!states.has(lesson.teacherId)) { work.addText(lesson.teacherId); states.set(lesson.teacherId, state); }
        while (state.position < rows.length && Date.parse(rows[state.position].occurredAt) < time) {
          await work.step(); const event = rows[state.position++], effect = await effectOf(event);
          if (effect === "invalidate") state.keys = undefined;
          else if (effect === "snapshot") {
            const keys = snapshots.get(event);
            if (!keys) throw new Error("Не найден проверенный снимок общих назначений. Частичный результат не создан.");
            state.keys = keys;
          }
        }
        if (state.tieTime !== time) {
          state.tieTime = time; state.tied = false;
          for (let position = state.position; position < rows.length && Date.parse(rows[position].occurredAt) === time; position++) {
            await work.step(); if (await effectOf(rows[position]) !== "none") { state.tied = true; break; }
          }
        }
        if (state.tied) {
          ambiguous++;
          finding("review", "ambiguous-publication-general-membership-order", "Публикация и изменение общих назначений/роли преподавателя имеют одинаковое время. Порядок разных документов не выбирался.", publication.id, lesson.teacherId);
        } else if (!state.keys) {
          unknown++;
          finding("review", "missing-publication-general-membership-snapshot", "До публикации нет пригодного явного снимка общих назначений либо последующее изменение сделало его неизвестным. Текущие назначения не подставлялись.", publication.id, lesson.teacherId);
        } else {
          checked++;
          if (!state.keys.has(scopeKey(lesson.subjectId, lesson.groupId))) {
            excluded++;
            finding("error", "publication-outside-historical-general-membership", "Учебная область занятия отсутствует в последнем пригодном явном снимке общих назначений преподавателя. По действующему правилу публикации такое назначение не допускает занятие.", publication.id, lesson.id);
          }
        }
      }
      if (time > cutoff) {
        future++;
        finding("review", "unchecked-publication-membership-after-cutoff", "Публикация позже границы архива не использована для проверки прежних общих назначений.", publication.id);
      } else if (publication.origin === "saved-snapshot" && publication.week.lessons.length) {
        baselines++;
        finding("review", "unconfirmed-baseline-general-membership", "Начальный снимок не подтверждает время исходной публикации. Общие назначения на дату захвата не подставлялись в прежнее занятие.", publication.id);
      }
    }
    const summary = `Общие назначения публикаций: копий занятий ${copies}; сопоставлений с явным снимком ${checked}; исключённых областей ${excluded}; неизвестных назначений ${unknown}; равных времён ${ambiguous}; начальных снимков ${baselines}; публикаций после границы ${future}. Совпадение области не подтверждает статус входа, полномочия или полноту ранних данных.`;
    finding("review", "unconfirmed-publication-general-membership-authority", summary);
    checkBackupAbort(signal); return { issues, summary };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить общие назначения преподавателей в исторических публикациях:", error);
    throw error;
  }
}
