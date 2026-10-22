import type { MessageAttachment } from "./messageStore";
import { getAttachmentError } from "../domain/files";

type AttachmentRecord = MessageAttachment & { scope: string; blob: Blob };
const STORE = "attachments";
const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  let blocked = false;
  const request = indexedDB.open("bi-university-message-files", 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
  request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
  request.onerror = () => reject(request.error);
  request.onblocked = () => { blocked = true; reject(new Error("Хранилище файлов занято другой вкладкой")); };
});

/** Binary files never enter localStorage. Scope is checked on every read/removal. */
export const messageAttachmentRepository = {
  async copy(sourceScope: string, targetScope: string, ids: string[]): Promise<MessageAttachment[]> {
    if (!ids.length) return [];
    const database = await openDatabase();
    try {
      return await new Promise<MessageAttachment[]>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        const copied: MessageAttachment[] = [];
        let failure: Error | undefined;
        ids.forEach((id) => {
          const request = store.get(id);
          request.onsuccess = () => {
            const original = request.result as AttachmentRecord | undefined;
            if (!original || original.scope !== sourceScope || !(original.blob instanceof Blob)) {
              failure = new Error("Исходный файл сообщения недоступен. Повторите отправку вложения.");
              transaction.abort();
              return;
            }
            const record = { ...original, id: crypto.randomUUID(), scope: targetScope };
            store.add(record);
            copied.push({ id: record.id, name: record.name, type: record.type, size: record.size });
          };
        });
        transaction.oncomplete = () => resolve(copied);
        transaction.onerror = () => reject(failure ?? transaction.error);
        transaction.onabort = () => reject(failure ?? transaction.error);
      });
    } finally { database.close(); }
  },
  async save(scope: string, files: File[]): Promise<MessageAttachment[]> {
    if (!files.length) return [];
    if (files.length > 5 || files.some((file) => getAttachmentError(file))) throw new Error("Можно приложить до 5 файлов, каждый до 25 МБ.");
    const records: AttachmentRecord[] = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, scope, blob: file }));
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        records.forEach((record) => transaction.objectStore(STORE).add(record));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return records.map(({ id, name, type, size }) => ({ id, name, type, size }));
    } finally { database.close(); }
  },
  async read(scope: string, id: string): Promise<AttachmentRecord> {
    const database = await openDatabase();
    try {
      return await new Promise<AttachmentRecord>((resolve, reject) => {
        const request = database.transaction(STORE).objectStore(STORE).get(id);
        request.onsuccess = () => {
          const file = request.result as AttachmentRecord | undefined;
          if (!file || file.scope !== scope || !(file.blob instanceof Blob)) reject(new Error("Файл недоступен в этом браузере"));
          else resolve(file);
        };
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  },
  async remove(scope: string, ids: string[]) {
    if (!ids.length) return;
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        ids.forEach((id) => {
          const request = store.get(id);
          request.onsuccess = () => { if ((request.result as AttachmentRecord | undefined)?.scope === scope) store.delete(id); };
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { database.close(); }
  },
};
