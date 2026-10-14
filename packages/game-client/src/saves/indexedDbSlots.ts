import type { StoredSave } from "../engine/sessionSave.js";
import { hashShards } from "./hashShards.js";
import { assertSlotId, newestFirst, toSlotMeta, type SlotMeta } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

const DATABASE = "boleiro";
const METAS = "slots";
/** By slot id: the save's string if it was written whole, as before shards, or else the index of its shards. */
const SAVES = "saves";
/** Each shard of a save, under `[slot id, shard name]`. */
const SHARDS = "shards";

/** What a slot saved in shards keeps under its id in `SAVES`: each shard's hash by name. */
type ShardIndex = { shards: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShardIndex(value: unknown): value is ShardIndex {
  return isRecord(value) && isRecord(value.shards) && Object.values(value.shards).every((hash) => typeof hash === "string");
}

/** The hashes of the shards a slot holds now; none for an empty slot or one written whole. */
function hashesIn(stored: unknown): Record<string, string> {
  return isShardIndex(stored) ? stored.shards : {};
}

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
      const request = factory.open(DATABASE, 2);
      request.onupgradeneeded = ({ oldVersion }) => {
        if (oldVersion < 1) {
          request.result.createObjectStore(METAS, { keyPath: "id" });
          request.result.createObjectStore(SAVES);
        }
        if (oldVersion < 2) request.result.createObjectStore(SHARDS);
      };
      request.onsuccess = () => {
        // Another tab upgrading the database waits until this one lets go of it.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error("could not open the saves database"));
    });
    return opened;
  }

  /**
   * Changes slot `id` in one transaction over every store, given what the slot holds now, so the slot moves
   * to its new save whole or, when anything fails before the commit, keeps its old one.
   */
  async function changeSlot(id: string, change: (transaction: IDBTransaction, stored: unknown) => void): Promise<void> {
    const transaction = (await database()).transaction([METAS, SAVES, SHARDS], "readwrite");
    const done = committed(transaction);
    const stored = transaction.objectStore(SAVES).get(id);
    stored.onsuccess = () => change(transaction, stored.result);
    await done;
  }

  return {
    async list() {
      const rows: unknown[] = await settled((await database()).transaction(METAS).objectStore(METAS).getAll());
      return newestFirst(rows.map(toSlotMeta).filter((meta) => meta !== null));
    },
    async write(meta: SlotMeta, save: StoredSave) {
      const { id } = meta;
      assertSlotId(id);
      const hashes = typeof save === "string" ? {} : await hashShards(save);
      await changeSlot(id, (transaction, stored) => {
        const shards = transaction.objectStore(SHARDS);
        const before = hashesIn(stored);
        if (typeof save !== "string") {
          for (const [name, json] of Object.entries(save)) if (before[name] !== hashes[name]) shards.put(json, [id, name]);
        }
        for (const name of Object.keys(before)) if (!(name in hashes)) shards.delete([id, name]);
        transaction.objectStore(SAVES).put(typeof save === "string" ? save : { shards: hashes }, id);
        transaction.objectStore(METAS).put(meta);
      });
    },
    async read(id) {
      const transaction = (await database()).transaction([SAVES, SHARDS]);
      const stored: unknown = await settled(transaction.objectStore(SAVES).get(id));
      if (typeof stored === "string") return stored;
      if (!isShardIndex(stored)) throw new Error(`no save in slot ${id}`);
      const shards = transaction.objectStore(SHARDS);
      const read = await Promise.all(
        Object.keys(stored.shards).map(async (name) => {
          const json: unknown = await settled(shards.get([id, name]));
          if (typeof json !== "string") throw new Error(`the save in slot ${id} is missing its shard ${name}`);
          return [name, json] as const;
        }),
      );
      return Object.fromEntries(read);
    },
    remove(id) {
      return changeSlot(id, (transaction, stored) => {
        for (const name of Object.keys(hashesIn(stored))) transaction.objectStore(SHARDS).delete([id, name]);
        transaction.objectStore(SAVES).delete(id);
        transaction.objectStore(METAS).delete(id);
      });
    },
  };
}
