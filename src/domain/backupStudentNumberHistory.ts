import type { AccountsDocument } from "./accounts";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { resolveArchivedAccountHistory, type ArchivedAccountHistoryIndex } from "./backupAccountHistory";

/** Check explicit issuance events only; creation and imports need not have a separate event. */
export const inspectArchivedStudentNumberHistory = async (document: AccountsDocument, signal?: AbortSignal, historyIndex?: ArchivedAccountHistoryIndex) => {
  checkBackupAbort(signal);
  const accounts = new Map(document.accounts.map((account) => [account.id, account]));
  const history = await resolveArchivedAccountHistory(document.history, signal, historyIndex);
  const ids = history.idCounts; const issues: BackupDocumentIssue[] = [];
  let total = 0; let matched = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const { entry, position } of history.issuances) {
    await step();
    if (entry.action !== "student-number-issued") continue;
    total++;
    const note = (level: BackupDocumentIssue["level"], code: string, message: string) => issues.push({ kind: "accounts", level, code, recordId: JSON.stringify(["history", entry.id, position + 1]), message });
    if (!entry.id.trim() || ids.get(entry.id) !== 1) {
      note("review", "unresolved-student-number-history-id", "У записи выдачи нет однозначного ID события. Строка истории сохранена отдельно; событие по совпадению других полей не выбиралось."); continue;
    }
    const changes = entry.changes?.filter((change) => change.field === "studentNumber") ?? [];
    const value = changes.length === 1 ? changes[0] : undefined;
    if (!value || value.before !== "" || value.after.length !== 9 || !/^[2-9]\d{3}[1-9]\d{4}$/.test(value.after) || value.after.endsWith("0000")) {
      note("review", "unresolved-student-number-history-value", "В записи явной выдачи не сохранено однозначное изменение номера зачетки из пустого значения в поддерживаемый номер. Старое событие не исправлялось; номер из учётки вместо него не подставлялся."); continue;
    }
    const account = accounts.get(entry.accountId);
    if (!account) {
      note("review", "missing-student-number-history-account", "Учётка из события выдачи отсутствует в архиве. Связь не подтверждена; другая учётка по ФИО, логину или номеру не подбиралась."); continue;
    }
    if (!account.studentRecord) {
      note("review", "missing-student-number-history-record", "В событии указана выдача, но у связанной учётки не сохранена зачетка. Требуется проверка исходных данных; номер из истории не назначался автоматически."); continue;
    }
    if (account.studentRecord.number !== value.after) {
      note("error", "student-number-history-conflict", "Номер зачетки в событии выдачи расходится с номером сохранённой учётки с тем же ID. Номера не включены в замечание; история, учётка и счётчики не изменялись."); continue;
    }
    matched++;
  }
  checkBackupAbort(signal);
  return { issues, summary: total ? `Записей явной выдачи зачетки: ${total}; согласовано с учётками: ${matched}; требуют проверки: ${total - matched}. Отсутствие отдельного события не считается ошибкой для создания, импорта и смены роли. Согласованность номера не подтверждает подлинность истории, полномочия автора или полноту ранних выдач; исторические значения не используются для пересчёта счётчиков.` : "" };
};
