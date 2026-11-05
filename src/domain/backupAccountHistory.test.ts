import { describe, expect, it, vi } from "vitest";
import type { AccountChange } from "./accounts";
import { archivedAccountBatchKey, indexArchivedAccountHistory } from "./backupAccountHistory";
import { inspectArchivedStudentImports } from "./backupStudentImports";
import { inspectArchivedStudentOperations } from "./backupStudentOperations";
import { inspectArchivedStudentNumberHistory } from "./backupStudentNumberHistory";
import { studentImportBackupFixture, studentOperationBackupFixture } from "../testSupport/localBackupDocuments";

const entry = (patch: Partial<AccountChange> = {}): AccountChange => ({ id: "audit-1", actorId: "actor", accountId: "student", occurredAt: "2026-10-28T10:00:00Z", action: "created", previousRole: null, nextRole: "student", ...patch });
describe("shared archived account history index", () => {
  it("retains duplicate IDs and exact source positions without merging entries", async () => {
    const history = [entry(), entry({ action: "student-number-issued" }), entry({ id: "third", importBatchId: "import", studentOperationBatchId: "operation" })];
    const before = JSON.stringify(history); const index = await indexArchivedAccountHistory(history);
    expect(index.source).toBe(history); expect(index.idCounts.get("audit-1")).toBe(2);
    expect(index.issuances).toEqual([{ entry: history[1], position: 1 }]);
    expect(index.imports.get(archivedAccountBatchKey("import", "student"))).toEqual([history[2]]);
    expect(index.operations.get(archivedAccountBatchKey("operation", "student"))).toEqual([history[2]]);
    expect(JSON.stringify(history)).toBe(before);
  });
  it("keeps operation and import namespaces separate, including compound IDs with colons", async () => {
    const history = [entry({ importBatchId: "a:b", accountId: "c" }), entry({ id: "second", studentOperationBatchId: "a", accountId: "b:c" })];
    const index = await indexArchivedAccountHistory(history);
    expect(archivedAccountBatchKey("a:b", "c")).not.toBe(archivedAccountBatchKey("a", "b:c"));
    expect(index.imports.get(archivedAccountBatchKey("a", "b:c"))).toBeUndefined();
    expect(index.operations.get(archivedAccountBatchKey("a:b", "c"))).toBeUndefined();
  });
  it("reuses a single traversal across all three archive checks", async () => {
    const imported = studentImportBackupFixture(); const operation = studentOperationBackupFixture();
    imported.accounts.studentOperations = operation.accounts.studentOperations;
    imported.accounts.history.push(...operation.accounts.history);
    const scan = vi.spyOn(imported.accounts.history, "entries");
    const index = await indexArchivedAccountHistory(imported.accounts.history);
    await inspectArchivedStudentImports(imported.accounts, undefined, index);
    await inspectArchivedStudentOperations(imported.accounts, undefined, index);
    await inspectArchivedStudentNumberHistory(imported.accounts, undefined, index);
    expect(scan).toHaveBeenCalledOnce(); scan.mockRestore();
  });
  it("rejects reuse from a different archive even if its history contents match", async () => {
    const imported = studentImportBackupFixture(); const index = await indexArchivedAccountHistory([...imported.accounts.history]);
    await expect(inspectArchivedStudentImports(imported.accounts, undefined, index)).rejects.toThrow("другому документу архива");
    await expect(inspectArchivedStudentNumberHistory(imported.accounts, undefined, index)).rejects.toThrow("другому документу архива");
  });
  it("retains all rows beyond 200 and honours cancellation", async () => {
    const history = Array.from({ length: 205 }, (_, position) => entry({ id: `audit-${position}`, importBatchId: "import" }));
    expect((await indexArchivedAccountHistory(history)).imports.get(archivedAccountBatchKey("import", "student"))).toHaveLength(205);
    const controller = new AbortController(); const pending = indexArchivedAccountHistory(history, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
