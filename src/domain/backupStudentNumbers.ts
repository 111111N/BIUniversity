import type { AccountsDocument } from "./accounts";
import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";

/** Compare saved high-water marks with current records; never reconstruct deleted issuances. */
export const inspectArchivedStudentNumbers = async (document: AccountsDocument, signal?: AbortSignal) => {
  checkBackupAbort(signal);
  const counters = document.studentNumberCounters ?? {};
  const scopes = new Map<string, number>();
  const issues: BackupDocumentIssue[] = [];
  let records = 0; let exhausted = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  for (const account of document.accounts) {
    await step();
    const record = account.studentRecord;
    if (!record) continue;
    records++;
    const scope = `${record.year}:${record.campus}`;
    scopes.set(scope, Math.max(scopes.get(scope) ?? 0, record.sequence));
  }
  for (const [scope, saved] of Object.entries(counters)) {
    await step();
    if (!scopes.has(scope)) scopes.set(scope, 0);
    if (saved >= 9999) exhausted++;
  }
  for (const [scope, maximum] of scopes) {
    await step();
    const saved = counters[scope];
    if (maximum >= 9999 && (saved ?? 0) < 9999) exhausted++;
    if (!maximum) continue;
    if (saved === undefined) issues.push({ kind: "accounts", level: "review", code: "missing-student-number-counter", recordId: scope,
      message: "В учётках сохранены номера зачеток, но счётчик их года и корпуса отсутствует. Текущая выдача учитывает максимум оставшихся номеров; полнота прежних выдач и безопасный перенос счётчика не подтверждены. Счётчик не создавался.",
    });
    else if (saved < maximum) issues.push({ kind: "accounts", level: "review", code: "lagging-student-number-counter", recordId: scope,
      message: "Сохранённый счётчик ниже номера зачетки в учётках того же года и корпуса. Текущая выдача учитывает максимум оставшихся номеров; расхождение требует проверки перед переносом. Счётчик и зачетки не исправлялись.",
    });
  }
  checkBackupAbort(signal);
  const summary = records || scopes.size ? `Номеров зачеток в учётках: ${records}; сохранённых счётчиков: ${Object.keys(counters).length}; областей года и корпуса: ${scopes.size}; требуют проверки: ${issues.length}; областей с исчерпанной нумерацией: ${exhausted}. Значение выше максимума оставшихся номеров допустимо и не уменьшается. Сверка не подтверждает полноту ранних выдач и не определяет следующий номер после объединения архивов.` : "";
  return { issues, summary };
};
