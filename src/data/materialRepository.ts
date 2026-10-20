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

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
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
        const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(
          (request.result as StoredMaterial[])
            .filter((file) => (file.scope || "cabinet") === scope)
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

  async remove(id: string) {
    const database = await openDatabase();
    let scope: string | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
          const file = request.result as StoredMaterial | undefined;
          if (file) scope = file.scope || "cabinet";
          store.delete(id);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
    if (scope) window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: scope }));
  },

  async setPinned(id: string, pinned: boolean) {
    const database = await openDatabase();
    let updated: StoredMaterial | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
          const current = request.result as StoredMaterial | undefined;
          if (!current) { transaction.abort(); return; }
          updated = { ...current, pinned };
          store.put(updated);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error("Материал уже удалён"));
      });
    } finally { database.close(); }
    if (!updated) throw new Error("Материал не найден");
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: updated.scope || "cabinet" }));
    return updated;
  },

  download(file: StoredMaterial) {
    downloadBlob(file.blob, file.name);
  },
};
