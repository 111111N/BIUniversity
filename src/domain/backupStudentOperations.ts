import type { AccountsDocument } from "./accounts";
import type { StudentBulkReceipt } from "./studentBulkReceipt";
import { sameEducationState } from "./studentEducationEvent";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { archivedAccountBatchKey, resolveArchivedAccountHistory, type ArchivedAccountHistoryIndex } from "./backupAccountHistory";

const agreesWithAction = (operation: StudentBulkReceipt, row: StudentBulkReceipt["rows"][number]) => {
  const action = operation.action;
  const changed = !sameEducationState(row.before, row.after);
  if (changed !== (row.outcome === "changed")) return false;
  if (action.kind === "transfer") return row.before.enrollment === "studying" && row.after.enrollment === "studying" && row.after.groupId === action.groupId;
  return row.before.groupId === row.after.groupId && row.after.enrollment === action.kind
    && (row.before.enrollment === "studying" || row.before.enrollment === action.kind);
};

/** Compare each saved operation with its own snapshots and audit, not with later account state. */
export const inspectArchivedStudentOperations = async (document: AccountsDocument, signal?: AbortSignal, historyIndex?: ArchivedAccountHistoryIndex) => {
  checkBackupAbort(signal);
  const operations = document.studentOperations ?? [];
  if (!operations.length) return { issues: [] as BackupDocumentIssue[], summary: "" };
  const history = await resolveArchivedAccountHistory(document.history, signal, historyIndex);
  const audits = history.operations; const ids = history.idCounts;
  const issues: BackupDocumentIssue[] = [];
  let rows = 0; let matched = 0; let unchanged = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const operation of operations) for (const row of operation.rows) {
    await step(); rows++;
    const note = (level: BackupDocumentIssue["level"], code: string, message: string) => issues.push({ kind: "accounts", level, code, recordId: JSON.stringify(["student-operation", operation.id, row.accountId]), message });
    if (!agreesWithAction(operation, row)) {
      note("error", "student-operation-snapshot-conflict", "Результат строки массовой операции расходится с её действием или отметкой об изменении. Сверены сохранённые ID групп и состояния обучения, без сравнения с нынешней учёткой. Снимки и пакет не исправлялись."); continue;
    }
    if (row.outcome === "unchanged") { unchanged++; continue; }
    const entries = audits.get(archivedAccountBatchKey(operation.id, row.accountId)) ?? [];
    if (!entries.length) {
      note("review", "missing-student-operation-audit", "Для изменённой строки пакета не сохранена связанная запись аудита. Полнота истории не подтверждена; запись по ФИО, времени или текущему состоянию не подбиралась."); continue;
    }
    const audit = entries[0];
    if (entries.length !== 1 || !audit.id.trim() || ids.get(audit.id) !== 1) {
      note("review", "ambiguous-student-operation-audit", "Изменённая строка пакета не имеет единственной записи аудита с однозначным ID. Записи не объединялись; более позднее или похожее действие не выбиралось."); continue;
    }
    if (audit.action !== "details-changed" || audit.actorId !== operation.actorId) {
      note("error", "student-operation-audit-conflict", "Тип действия или заявленный ID автора в аудите расходится с массовой операцией. Это сверка сохранённых сведений, а не подтверждение исторических полномочий; данные не изменялись."); continue;
    }
    const transfer = operation.action.kind === "transfer";
    const changes = audit.changes?.filter((change) => change.field === "group" || change.field === "enrollmentStatus") ?? [];
    if (changes.length !== 1) {
      note("review", "unresolved-student-operation-audit-values", "В аудите строки не сохранено однозначное изменение группы или состояния обучения. Значения из снимка пакета вместо истории не подставлялись."); continue;
    }
    const change = changes[0];
    if (change.field !== (transfer ? "group" : "enrollmentStatus") || change.before !== (transfer ? row.before.groupId : row.before.enrollment) || change.after !== (transfer ? row.after.groupId : row.after.enrollment)) {
      note("error", "student-operation-audit-conflict", "Сохранённое изменение группы или состояния в аудите расходится со снимками строки массовой операции. Значения и названия групп в замечание не включены; история не переписывалась."); continue;
    }
    matched++;
  }
  checkBackupAbort(signal);
  return { issues, summary: `Пакетов массовых операций: ${operations.length}; строк: ${rows}; согласовано изменённых строк с аудитом: ${matched}; без изменения: ${unchanged}; требуют проверки: ${rows - matched - unchanged}. Сверяются действие, снимки, ID заявленного автора и содержимое связанного аудита. Более поздняя учётка и названия групп не заменяют исторические сведения; даты, основания, полномочия и полнота истории этой сверкой не подтверждаются.` };
};
