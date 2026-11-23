import { canonicalBackupValue } from "../domain/localBackupValidation";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, encodeBackupValue, type AdministrativeBackup, type BackupBudget, type RawBackupDatabase } from "../domain/localBackup";

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");

/** Commit exact UTF-16 code units, including lone surrogates, with bounded binary allocations. */
const fingerprintText = async (text: string, signal?: AbortSignal) => {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += 32_768) {
    checkBackupAbort(signal);
    const size = Math.min(32_768, text.length - offset), bytes = new Uint8Array(size * 2);
    for (let index = 0; index < size; index++) {
      const code = text.charCodeAt(offset + index);
      bytes[index * 2] = code & 255; bytes[index * 2 + 1] = code >>> 8;
    }
    chunks.push(hex(await crypto.subtle.digest("SHA-256", bytes)));
    if (chunks.length % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  }
  const root = new TextEncoder().encode(JSON.stringify(["bi-university-snapshot-text-v1", text.length, chunks]));
  const digest = await crypto.subtle.digest("SHA-256", root);
  checkBackupAbort(signal);
  return hex(digest);
};

/** Fingerprint serialized records without displaying or executing attachments; retain values only for the first comparison pass. */
async function capture(raw: RawBackupDatabase, budget: BackupBudget, signal: AbortSignal | undefined, retainRecords: boolean) {
  try {
    checkBackupAbort(signal);
    if (typeof crypto === "undefined" || typeof crypto.subtle?.digest !== "function") throw new Error("Недоступна проверка отпечатка файловых данных. Сравнение архива остановлено.");
    if (raw.stores.length > BACKUP_LIMITS.records) throw new Error("Текущая файловая база содержит слишком много хранилищ. Сравнение остановлено.");
    const database: AdministrativeBackup["databases"][number] = { ...raw, stores: [] }, storeHashes: string[] = [];
    addBackupText(budget, raw.name);
    const step = async () => {
      if (++budget.nodes > BACKUP_LIMITS.nodes) throw new Error("Текущие файловые данные превышают предел структуры сравнения.");
      if (budget.nodes % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      checkBackupAbort(signal);
    };
    const keyPathText = async (path: string | string[] | null) => {
      for (const part of typeof path === "string" ? [path] : path ?? []) { await step(); addBackupText(budget, part); }
    };
    for (const store of raw.stores) {
      await step(); addBackupText(budget, store.name); await keyPathText(store.keyPath);
      if (store.indexes.length > BACKUP_LIMITS.records) throw new Error("Текущее файловое хранилище содержит слишком много индексов. Сравнение остановлено.");
      const indexes = [...store.indexes].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
      for (const index of indexes) { await step(); addBackupText(budget, index.name); await keyPathText(index.keyPath); }
      const schemaHash = await fingerprintText(JSON.stringify([store.name, store.keyPath, store.autoIncrement, indexes.map(index => [index.name, index.keyPath, index.unique, index.multiEntry])]), signal);
      const records: AdministrativeBackup["databases"][number]["stores"][number]["records"] = [], recordHashes: string[][] = [];
      for (const record of store.records) {
        if (++budget.records > BACKUP_LIMITS.records) throw new Error("Текущие файловые хранилища превышают лимит сравнения 25 000 записей.");
        if (budget.records % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
        checkBackupAbort(signal);
        const key = await encodeBackupValue(record.key, budget, signal), value = await encodeBackupValue(record.value, budget, signal);
        if (retainRecords) records.push({ key, value });
        recordHashes.push([await fingerprintText(canonicalBackupValue(key), signal), await fingerprintText(canonicalBackupValue(value), signal)]);
      }
      // Cursor and metadata enumeration order do not change stored keys, values or index definitions.
      recordHashes.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
      storeHashes.push(await fingerprintText(JSON.stringify(["store", schemaHash, recordHashes]), signal));
      if (retainRecords) database.stores.push({ ...store, records });
    }
    const fingerprint = await fingerprintText(JSON.stringify(["bi-university-database-snapshot-v1", raw.name, raw.version, storeHashes.sort()]), signal);
    checkBackupAbort(signal);
    return { database, fingerprint };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Не удалось зафиксировать полный снимок текущих файловых данных для сравнения архива:", error);
    throw error;
  }
}

export const captureBackupDatabaseSnapshot = (raw: RawBackupDatabase, budget: BackupBudget, signal?: AbortSignal) => capture(raw, budget, signal, true);
export const fingerprintBackupDatabaseSnapshot = async (raw: RawBackupDatabase, budget: BackupBudget, signal?: AbortSignal) => (await capture(raw, budget, signal, false)).fingerprint;
