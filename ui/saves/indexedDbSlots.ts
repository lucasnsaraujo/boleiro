import { assertSlotId, newestFirst, toSlotMeta } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

const DATABASE = "boleiro";
const METAS = "slots";
const SAVES = "saves";

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function committed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** The web build's saves, kept in the browser so e2e runs without Tauri. */
export function indexedDbSlots(factory: IDBFactory = indexedDB): SlotStore {
  let opened: Promise<IDBDatabase> | null = null;

  function database(): Promise<IDBDatabase> {
    opened ??= new Promise((resolve, reject) => {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(METAS, { keyPath: "id" });
        request.result.createObjectStore(SAVES);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("could not open the saves database"));
    });
    return opened;
  }

  return {
    async list() {
      const rows: unknown[] = await settled((await database()).transaction(METAS).objectStore(METAS).getAll());
      return newestFirst(rows.map(toSlotMeta).filter((meta) => meta !== null));
    },
    async write(meta, save) {
      assertSlotId(meta.id);
      const transaction = (await database()).transaction([METAS, SAVES], "readwrite");
      transaction.objectStore(METAS).put(meta);
      transaction.objectStore(SAVES).put(save, meta.id);
      await committed(transaction);
    },
    async read(id) {
      const save: unknown = await settled((await database()).transaction(SAVES).objectStore(SAVES).get(id));
      if (typeof save !== "string") throw new Error(`no save in slot ${id}`);
      return save;
    },
    async remove(id) {
      const transaction = (await database()).transaction([METAS, SAVES], "readwrite");
      transaction.objectStore(METAS).delete(id);
      transaction.objectStore(SAVES).delete(id);
      await committed(transaction);
    },
  };
}
