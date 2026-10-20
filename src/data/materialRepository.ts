import { downloadBlob } from "../domain/fileDownload";

export interface StoredMaterial {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  blob: Blob;
  scope: string;
  category?: string;
  uploadedBy?: string;
  description?: string;
  pinned?: boolean;
}

const DB_NAME = "bi-university-cabinet";
const STORE_NAME = "teacher-files";
const CHANGE_EVENT = "bi-university-materials-change";
const LEGACY_CABINET_OWNER_ID = "teacher-elena-volkova";

export const getPersonalMaterialScope = (userId: string) => `user:${encodeURIComponent(userId)}`;

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  let blocked = false;
  const request = indexedDB.open(DB_NAME, 2);
  request.onupgradeneeded = () => {
    try {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains("scope")) store.createIndex("scope", "scope");
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const file = cursor.value as StoredMaterial;
        // Old personal files had no owner; they belong to the original demo teacher.
        if (!file.scope || file.scope === "cabinet") cursor.update({ ...file, scope: getPersonalMaterialScope(LEGACY_CABINET_OWNER_ID) });
        cursor.continue();
      };
    } catch (error) {
      console.error("Не удалось обновить хранилище материалов:", error);
      request.transaction?.abort();
    }
  };
  request.onsuccess = () => {
    if (blocked) { request.result.close(); return; }
    request.result.onversionchange = () => request.result.close();
    resolve(request.result);
  };
  request.onerror = () => reject(request.error);
  request.onblocked = () => {
    blocked = true;
    reject(new Error("Обновление хранилища материалов заблокировано. Закройте другие вкладки сайта и повторите загрузку."));
  };
});

export const materialRepository = {
  subscribe(scope: string, listener: () => void) {
    const handleChange = (event: Event) => { if ((event as CustomEvent<string>).detail === scope) listener(); };
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  },
  async list(scope: string) {
    const database = await openDatabase();
    try {
      return await new Promise<StoredMaterial[]>((resolve, reject) => {
        const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).index("scope").getAll(scope);
        request.onsuccess = () => resolve(
          (request.result as StoredMaterial[])
            .sort((a, b) => b.createdAt - a.createdAt),
        );
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  },

  async save(file: StoredMaterial) {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(file);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: file.scope }));
  },

  async remove(id: string, scope: string) {
    const database = await openDatabase();
    let failure: Error | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
          const file = request.result as StoredMaterial | undefined;
          if (!file || file.scope !== scope) {
            failure = new Error("Материал удалён или недоступен в этом разделе.");
            transaction.abort();
            return;
          }
          store.delete(id);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(failure ?? transaction.error);
      });
    } catch (error) {
      console.error("Не удалось удалить материал из выбранного раздела:", error);
      throw error;
    } finally {
      database.close();
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: scope }));
  },

  async setPinned(id: string, pinned: boolean, scope: string) {
    const database = await openDatabase();
    let updated: StoredMaterial | undefined;
    let failure: Error | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
          const current = request.result as StoredMaterial | undefined;
          if (!current || current.scope !== scope) {
            failure = new Error("Материал удалён или недоступен в этом разделе.");
            transaction.abort();
            return;
          }
          updated = { ...current, pinned };
          store.put(updated);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(failure ?? transaction.error);
      });
    } catch (error) {
      console.error("Не удалось изменить закрепление материала в выбранном разделе:", error);
      throw error;
    } finally { database.close(); }
    if (!updated) throw new Error("Материал не найден");
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: scope }));
    return updated;
  },

  download(file: StoredMaterial) {
    downloadBlob(file.blob, file.name);
  },
};
