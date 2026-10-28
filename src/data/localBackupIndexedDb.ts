import { BACKUP_LIMITS, checkBackupAbort, type RawBackupDatabase } from "../domain/localBackup";

/** Open only an enumerated database; abort any creation/upgrade race instead of running repository migrations. */
export const readExistingBackupDatabase = (factory: IDBFactory, name: string, requiredStore: string, signal?: AbortSignal) => new Promise<RawBackupDatabase>((resolve, reject) => {
  checkBackupAbort(signal);
  let settled = false;
  let database: IDBDatabase | undefined;
  let transaction: IDBTransaction | undefined;
  const finish = (error?: Error, result?: RawBackupDatabase) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    if (error && transaction) { try { transaction.abort(); } catch { /* Already completed. */ } }
    database?.close();
    if (error) reject(error); else resolve(result!);
  };
  const onAbort = () => finish(new DOMException("Выгрузка отменена", "AbortError"));
  const timeout = setTimeout(() => finish(new Error(`Хранилище «${name}» не отвечает. Закройте другие вкладки портала и повторите выгрузку.`)), 15_000);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      finish(new Error(`Хранилище «${name}» изменилось или удалено. Повторите выгрузку.`));
    };
    request.onerror = () => finish(new Error(`Не удалось открыть хранилище «${name}». Выгрузка остановлена.`));
    request.onblocked = () => finish(new Error(`Хранилище «${name}» занято другой вкладкой. Закройте её и повторите выгрузку.`));
    request.onsuccess = () => {
      database = request.result;
      if (settled) { database.close(); return; }
      database.onversionchange = () => finish(new Error(`Версия хранилища «${name}» изменилась. Повторите выгрузку.`));
      try {
        if (!database.objectStoreNames.contains(requiredStore)) throw new Error(`Хранилище «${name}» имеет несовместимую структуру. Архив не создан.`);
        const names = Array.from(database.objectStoreNames);
        transaction = database.transaction(names, "readonly");
        const result: RawBackupDatabase = { name, version: database.version, capturedAt: "", stores: [] };
        let records = 0;
        transaction.onabort = () => finish(new Error(`Чтение хранилища «${name}» прервано. Архив не создан.`));
        transaction.onerror = () => finish(new Error(`Не удалось прочитать хранилище «${name}». Архив не создан.`));
        transaction.oncomplete = () => { result.capturedAt = new Date().toISOString(); finish(undefined, result); };
        for (const storeName of names) {
          const store = transaction.objectStore(storeName);
          const snapshot: RawBackupDatabase["stores"][number] = {
            name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
            indexes: Array.from(store.indexNames, (indexName) => { const index = store.index(indexName); return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry }; }), records: [],
          };
          result.stores.push(snapshot);
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            try {
              checkBackupAbort(signal);
              if (!cursor.result) return;
              if (++records > BACKUP_LIMITS.records) throw new Error("В хранилище больше 25 000 записей. Архив не создан.");
              snapshot.records.push({ key: cursor.result.primaryKey, value: cursor.result.value });
              cursor.result.continue();
            } catch (error) { finish(error instanceof Error ? error : new Error("Не удалось прочитать запись хранилища.")); }
          };
        }
      } catch (error) { finish(error instanceof Error ? error : new Error("Не удалось прочитать структуру хранилища.")); }
    };
  } catch (error) { finish(error instanceof Error ? error : new Error("Хранилище файлов недоступно.")); }
});
