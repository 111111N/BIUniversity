import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readExistingBackupDatabase } from "./localBackupIndexedDb";

// Event-driven contract double: no library, browser launch or real user's storage.
const harness = () => {
  const request = { onupgradeneeded: () => undefined, onsuccess: () => undefined, onerror: () => undefined, onblocked: () => undefined, result: undefined as unknown, transaction: { abort: vi.fn() } };
  const cursors: { result: { primaryKey: string; value: unknown; continue(): void } | null; onsuccess(): void }[] = [];
  const store = { keyPath: "id", autoIncrement: false, indexNames: ["scope"], index: () => ({ name: "scope", keyPath: "scope", unique: false, multiEntry: false }), openCursor: vi.fn(() => { const cursor = { result: null, onsuccess: () => undefined }; cursors.push(cursor); return cursor; }) };
  const transaction = { objectStore: vi.fn(() => store), abort: vi.fn(), oncomplete: () => undefined, onabort: () => undefined, onerror: () => undefined };
  const database = { version: 2, objectStoreNames: Object.assign(["teacher-files"], { contains: (name: string) => name === "teacher-files" }), transaction: vi.fn(() => transaction), close: vi.fn(), onversionchange: () => undefined };
  request.result = database;
  const factory = { open: vi.fn(() => request) };
  return { request, factory: factory as unknown as IDBFactory, open: factory.open, database, transaction, cursors };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("read-only IndexedDB backup adapter", () => {
  it("reads inline/out-of-line keys, metadata and records with a readonly transaction, closing on completion", async () => {
    const state = harness(); const promise = readExistingBackupDatabase(state.factory, "db", "teacher-files");
    expect(state.open).toHaveBeenCalledWith("db"); state.request.onsuccess();
    expect(state.database.transaction).toHaveBeenCalledWith(["teacher-files"], "readonly");
    const next = vi.fn(); state.cursors[0].result = { primaryKey: "kept-key", value: { scope: "cabinet" }, continue: next }; state.cursors[0].onsuccess();
    expect(next).toHaveBeenCalledOnce(); state.transaction.oncomplete();
    await expect(promise).resolves.toMatchObject({ name: "db", version: 2, stores: [{ name: "teacher-files", keyPath: "id", autoIncrement: false, indexes: [{ name: "scope" }], records: [{ key: "kept-key", value: { scope: "cabinet" } }] }] });
    expect(state.database.close).toHaveBeenCalledOnce(); expect(state.transaction.abort).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts a missing-database creation race instead of creating or upgrading schema", async () => {
    const state = harness(); const promise = readExistingBackupDatabase(state.factory, "db", "teacher-files");
    const rejected = expect(promise).rejects.toThrow("изменилось или удалено"); state.request.onupgradeneeded(); await rejected;
    expect(state.request.transaction.abort).toHaveBeenCalledOnce(); expect(state.database.transaction).not.toHaveBeenCalled();
    state.request.onerror(); state.request.onsuccess(); expect(state.database.close).toHaveBeenCalledOnce();
  });
  it("never accepts a partial result when a transaction aborts", async () => {
    const state = harness(); const promise = readExistingBackupDatabase(state.factory, "db", "teacher-files");
    const rejected = expect(promise).rejects.toThrow("прервано"); state.request.onsuccess(); state.transaction.onabort(); await rejected;
    expect(state.database.close).toHaveBeenCalledOnce();
  });
  it("rejects an incompatible store without attempting a schema migration", async () => {
    const state = harness(); const promise = readExistingBackupDatabase(state.factory, "db", "unknown-store");
    const rejected = expect(promise).rejects.toThrow("несовместимую структуру"); state.request.onsuccess(); await rejected;
    expect(state.database.transaction).not.toHaveBeenCalled(); expect(state.database.close).toHaveBeenCalledOnce();
  });
  it("closes a late database connection after cancellation", async () => {
    const state = harness(); const controller = new AbortController();
    const promise = readExistingBackupDatabase(state.factory, "db", "teacher-files", controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await rejected;
    state.request.onsuccess(); expect(state.database.close).toHaveBeenCalledOnce(); expect(state.database.transaction).not.toHaveBeenCalled();
  });
  it("cancels an active transaction and removes its timeout", async () => {
    const state = harness(); const controller = new AbortController();
    const promise = readExistingBackupDatabase(state.factory, "db", "teacher-files", controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" }); state.request.onsuccess(); controller.abort(); await rejected;
    expect(state.transaction.abort).toHaveBeenCalledOnce(); expect(state.database.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["blocked", "error", "timeout", "versionchange"])("does not hang or retain connections after %s", async (kind) => {
    const state = harness(); const promise = readExistingBackupDatabase(state.factory, "db", "teacher-files");
    const rejected = expect(promise).rejects.toThrow();
    if (kind === "blocked") state.request.onblocked();
    if (kind === "error") state.request.onerror();
    if (kind === "timeout") vi.advanceTimersByTime(15_000);
    if (kind === "versionchange") { state.request.onsuccess(); state.database.onversionchange(); }
    await rejected; expect(vi.getTimerCount()).toBe(0);
    if (kind === "versionchange") expect(state.database.close).toHaveBeenCalledOnce();
    else { state.request.onsuccess(); expect(state.database.close).toHaveBeenCalledOnce(); expect(state.database.transaction).not.toHaveBeenCalled(); }
  });
});
