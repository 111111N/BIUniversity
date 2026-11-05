import type { AccountChange } from "./accounts";
import { checkBackupAbort } from "./localBackup";

export const archivedAccountBatchKey = (batchId: string, accountId: string) => JSON.stringify([batchId, accountId]);
export interface ArchivedAccountHistoryIndex {
  readonly source: readonly AccountChange[];
  readonly idCounts: ReadonlyMap<string, number>;
  readonly operations: ReadonlyMap<string, readonly AccountChange[]>;
  readonly imports: ReadonlyMap<string, readonly AccountChange[]>;
  readonly issuances: readonly { entry: AccountChange; position: number }[];
}

export const indexArchivedAccountHistory = async (history: readonly AccountChange[], signal?: AbortSignal): Promise<ArchivedAccountHistoryIndex> => {
  checkBackupAbort(signal);
  const idCounts = new Map<string, number>(); const operations = new Map<string, AccountChange[]>(); const imports = new Map<string, AccountChange[]>();
  const issuances: { entry: AccountChange; position: number }[] = [];
  const append = (map: Map<string, AccountChange[]>, batchId: string, entry: AccountChange) => {
    const key = archivedAccountBatchKey(batchId, entry.accountId); const rows = map.get(key) ?? [];
    rows.push(entry); map.set(key, rows);
  };
  for (const [position, entry] of history.entries()) {
    if (position % 128 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); }
    idCounts.set(entry.id, (idCounts.get(entry.id) ?? 0) + 1);
    if (entry.studentOperationBatchId !== undefined) append(operations, entry.studentOperationBatchId, entry);
    if (entry.importBatchId !== undefined) append(imports, entry.importBatchId, entry);
    if (entry.action === "student-number-issued") issuances.push({ entry, position });
  }
  checkBackupAbort(signal);
  return { source: history, idCounts, operations, imports, issuances };
};

export const resolveArchivedAccountHistory = (history: readonly AccountChange[], signal?: AbortSignal, index?: ArchivedAccountHistoryIndex) => {
  checkBackupAbort(signal);
  if (index && index.source !== history) throw new Error("Подготовленная история относится к другому документу архива. Повторите проверку.");
  return index ? Promise.resolve(index) : indexArchivedAccountHistory(history, signal);
};
