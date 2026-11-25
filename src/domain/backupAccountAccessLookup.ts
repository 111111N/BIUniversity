import { isAccountActive, type AccountChange, type AccountFieldChange, type AccountsDocument, type PortalAccount, type UserRole } from "./accounts";
import type { CoherentAccountHistoryContext } from "./backupAccountHistory";
import type { createBackupInspectionWork } from "./backupIssueCollector";
import type { BackupDocumentIssue, BackupDocumentKind } from "./localBackupDocuments";
import { checkBackupAbort } from "./localBackup";

export interface AccessHistoryPoint { kind: BackupDocumentKind; recordId: string }
export type AccessHistoryFinding = (point: AccessHistoryPoint, issue: Omit<BackupDocumentIssue, "kind" | "recordId">) => void;
type Access = "active" | "blocked";
type StatusEffect = "none" | "invalidate" | { before: Access; after: Access };
interface Effect { role: boolean; status: StatusEffect }
interface State { position: number; lastQuery?: number; role?: UserRole; access?: Access; tieTime?: number; roleTie: boolean; statusTie: boolean }
const isAccess = (value: string): value is Access => value === "active" || value === "blocked";
const neutralFields = new Set(["name", "login", "email", "scheduleName", "group", "memberships", "studentGroupId", "enrollmentStatus", "studentRecord", "studentNumber", "studentRecord.number"]);

/** Source-bound lookup of saved roles and explicit access states; callers keep their own policy. */
export async function createArchivedAccountAccessLookup(document: AccountsDocument, context: CoherentAccountHistoryContext, work: ReturnType<typeof createBackupInspectionWork>, onIssue: AccessHistoryFinding, signal?: AbortSignal) {
  const finding = (level: "error" | "review", code: string, message: string, point: AccessHistoryPoint, referenceId?: string) => onIssue(point, { level, code, message, ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    await work.step(0);
    if (context.source !== document) throw new Error("Подготовленная история доступа относится к другому полному источнику учёток.");
    for (const count of [document.accounts.length, document.history.length, context.coherentAccounts.size, context.histories.size]) work.assertRecords(count);
    const accounts = new Map<string, PortalAccount>(), effects = new Map<AccountChange, Effect>(), sealed = new Map<string, boolean>(), states = new Map<string, State>();
    for (const account of document.accounts) { await work.step(); work.addText(account.id); accounts.set(account.id, account); }
    const effectOf = async (event: AccountChange): Promise<Effect> => {
      const cached = effects.get(event); if (cached) return cached;
      await work.step(); const result: Effect = { role: event.action === "created" || event.action === "role-changed", status: "none" };
      if (event.action === "created") result.status = "invalidate";
      else {
        work.assertRecords(event.changes?.length ?? 0);
        let statusChange: AccountFieldChange | undefined;
        let statusFields = 0, unsupported = false;
        for (const change of event.changes ?? []) {
          await work.step();
          if (change.field === "status") { statusFields++; statusChange = change; }
          else if (!neutralFields.has(change.field)) unsupported = true;
        }
        if (event.action === "status-changed") {
          if (!unsupported && statusFields === 1 && statusChange && isAccess(statusChange.before) && isAccess(statusChange.after)) result.status = { before: statusChange.before, after: statusChange.after };
          else result.status = "invalidate";
        } else if (unsupported || statusFields || event.action === "details-changed" && !event.changes?.length) result.status = "invalidate";
      }
      effects.set(event, result); work.assertRecords(effects.size); return result;
    };
    const sealStatus = async (id: string, rows: readonly AccountChange[], point: AccessHistoryPoint) => {
      if (sealed.has(id)) return sealed.get(id)!;
      let known: Access | undefined;
      for (const event of rows) {
        await work.step(); const effect = (await effectOf(event)).status;
        if (effect === "invalidate") known = undefined;
        else if (effect !== "none") {
          if (known !== undefined && known !== effect.before) {
            sealed.set(id, false);
            finding("review", "inconsistent-account-access-status-chain", "Сохранённые состояния входа не соединяются в цепочку. Противоречивый источник не подтверждает состояние при историческом действии.", point, event.id);
            return false;
          }
          known = effect.after;
        }
      }
      const account = accounts.get(id);
      if (!account) throw new Error("Согласованная учётка отсутствует в источнике состояния доступа.");
      if (known !== undefined && known !== (isAccountActive(account) ? "active" : "blocked")) {
        sealed.set(id, false);
        finding("review", "inconsistent-account-access-status-tail", "Последнее известное состояние входа расходится с текущей карточкой. Дата недостающего изменения не достраивалась.", point, id);
        return false;
      }
      sealed.set(id, true); return true;
    };
    const stateAt = async (id: string, time: number, point: AccessHistoryPoint) => {
      await work.step();
      if (!Number.isFinite(time)) throw new Error("Не определено время запроса исторического состояния доступа.");
      if (!context.coherentAccounts.has(id)) return undefined;
      const rows = context.histories.get(id);
      if (!rows?.length) throw new Error("Для согласованной учётки отсутствует подготовленный аудит доступа.");
      work.assertRecords(rows.length);
      const usableStatus = await sealStatus(id, rows, point), state: State = states.get(id) ?? { position: 0, roleTie: false, statusTie: false };
      if (state.lastQuery !== undefined && time < state.lastQuery) throw new Error("Запросы исторического доступа одной учётки должны идти по времени без возврата назад.");
      state.lastQuery = time;
      states.set(id, state);
      while (state.position < rows.length && Date.parse(rows[state.position].occurredAt) < time) {
        await work.step(); const event = rows[state.position++], effect = await effectOf(event);
        state.role = event.nextRole;
        if (effect.status === "invalidate") state.access = undefined;
        else if (effect.status !== "none") state.access = effect.status.after;
      }
      if (state.tieTime !== time) {
        state.tieTime = time; state.roleTie = false; state.statusTie = false;
        for (let position = state.position; position < rows.length && Date.parse(rows[position].occurredAt) === time; position++) {
          await work.step(); const effect = await effectOf(rows[position]);
          state.roleTie ||= effect.role; state.statusTie ||= effect.status !== "none";
        }
      }
      return { ...state, access: usableStatus ? state.access : undefined };
    };
    checkBackupAbort(signal); return stateAt;
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось подготовить поиск сохранённых ролей и состояний входа:", error);
    throw error;
  }
}
