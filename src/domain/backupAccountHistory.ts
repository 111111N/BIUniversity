import type { AccountChange, AccountsDocument } from "./accounts";
import { checkBackupAbort } from "./localBackup";
import { createBackupInspectionWork } from "./backupIssueCollector";

export const archivedAccountBatchKey = (batchId: string, accountId: string) => JSON.stringify([batchId, accountId]);
export interface ArchivedAccountHistoryIndex {
  readonly source: readonly AccountChange[];
  readonly idCounts: ReadonlyMap<string, number>;
  readonly operations: ReadonlyMap<string, readonly AccountChange[]>;
  readonly imports: ReadonlyMap<string, readonly AccountChange[]>;
  readonly issuances: readonly { entry: AccountChange; position: number }[];
}
export interface CoherentAccountHistoryContext {
  source: AccountsDocument;
  coherentAccounts: ReadonlySet<string>;
  histories: ReadonlyMap<string, readonly AccountChange[]>;
}

const buildArchivedAccountHistory = async (history: readonly AccountChange[], signal?: AbortSignal): Promise<ArchivedAccountHistoryIndex> => {
  const work = createBackupInspectionWork("индекса истории учёток", signal);
  await work.step(0); work.assertRecords(history.length);
  const idCounts = new Map<string, number>(); const operations = new Map<string, AccountChange[]>(); const imports = new Map<string, AccountChange[]>();
  const issuances: { entry: AccountChange; position: number }[] = [];
  const append = (map: Map<string, AccountChange[]>, batchId: string, entry: AccountChange) => {
    const key = archivedAccountBatchKey(batchId, entry.accountId); const rows = map.get(key) ?? [];
    if (!map.has(key)) work.addText(key);
    rows.push(entry); map.set(key, rows);
  };
  for (const [position, entry] of history.entries()) {
    await work.step(); if (!idCounts.has(entry.id)) work.addText(entry.id);
    idCounts.set(entry.id, (idCounts.get(entry.id) ?? 0) + 1);
    if (entry.studentOperationBatchId !== undefined) append(operations, entry.studentOperationBatchId, entry);
    if (entry.importBatchId !== undefined) append(imports, entry.importBatchId, entry);
    if (entry.action === "student-number-issued") issuances.push({ entry, position });
  }
  checkBackupAbort(signal);
  return { source: history, idCounts, operations, imports, issuances };
};

export const indexArchivedAccountHistory = async (...args: Parameters<typeof buildArchivedAccountHistory>): Promise<ArchivedAccountHistoryIndex> => {
  try { return await buildArchivedAccountHistory(...args); }
  catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось подготовить ограниченный индекс истории учёток:", error);
    throw error;
  }
};

export const resolveArchivedAccountHistory = (history: readonly AccountChange[], signal?: AbortSignal, index?: ArchivedAccountHistoryIndex) => {
  checkBackupAbort(signal);
  if (index && index.source !== history) throw new Error("Подготовленная история относится к другому документу архива. Повторите проверку.");
  return index ? Promise.resolve(index) : indexArchivedAccountHistory(history, signal);
};
