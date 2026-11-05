import type { AccountsDocument } from "./accounts";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { archivedAccountBatchKey, resolveArchivedAccountHistory, type ArchivedAccountHistoryIndex } from "./backupAccountHistory";

/** Account/number references are decoded first; this pass checks the archived creation audit. */
export const inspectArchivedStudentImports = async (document: AccountsDocument, signal?: AbortSignal, historyIndex?: ArchivedAccountHistoryIndex) => {
  checkBackupAbort(signal);
  const imports = document.studentImports ?? [];
  if (!imports.length) return { issues: [] as BackupDocumentIssue[], summary: "" };
  const history = await resolveArchivedAccountHistory(document.history, signal, historyIndex);
  const issues: BackupDocumentIssue[] = [];
  let created = 0; let matched = 0; let skipped = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const receipt of imports) {
    for (let position = 0; position < receipt.skipped.length; position++) { await step(); skipped++; }
    for (const row of receipt.created) {
      await step(); created++;
      const note = (level: BackupDocumentIssue["level"], code: string, message: string) => issues.push({ kind: "accounts", level, code, recordId: JSON.stringify(["student-import", receipt.id, row.line, row.accountId]), message });
      const rows = history.imports.get(archivedAccountBatchKey(receipt.id, row.accountId)) ?? [];
      if (!rows.length) {
        note("review", "missing-student-import-audit", "У созданной строки импорта нет связанной записи аудита. Полнота истории не подтверждена; событие не создавалось из пакета или текущей учётки."); continue;
      }
      const audit = rows[0];
      if (rows.length !== 1 || !audit.id.trim() || history.idCounts.get(audit.id) !== 1) {
        note("review", "ambiguous-student-import-audit", "Созданная строка импорта не имеет единственной записи аудита с однозначным ID. Записи не объединялись и не выбирались по приоритету."); continue;
      }
      if (audit.action !== "created" || audit.previousRole !== null || audit.nextRole !== "student" || audit.actorId !== receipt.actorId) {
        note("error", "student-import-audit-conflict", "Тип действия, исходный или выданный тип учётки либо заявленный ID автора в аудите расходится с созданием студента в пакете импорта. История и пакет не исправлялись; прежние полномочия автора не определялись по текущей роли."); continue;
      }
      matched++;
    }
  }
  checkBackupAbort(signal);
  return { issues, summary: `Пакетов импорта студентов: ${imports.length}; созданных строк: ${created}; согласовано с аудитом: ${matched}; требуют проверки: ${created - matched}; существующих строк без повторного создания: ${skipped}. Сверены сохранённые ID пакета, учётки и заявленного автора, тип создания и роли аудита. Пропущенным существующим учёткам не требуется новое событие создания; нынешняя роль и ФИО не заменяют историю. Подлинность, даты, полнота истории и полномочия автора этой сверкой не подтверждаются.` };
};
