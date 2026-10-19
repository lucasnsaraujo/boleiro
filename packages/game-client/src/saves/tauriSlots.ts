import { invoke } from "@tauri-apps/api/core";
import type { StoredSave } from "../engine/sessionSave.js";
import { hashShards } from "./hashShards.js";
import { assertSlotId, newestFirst, toSlotMeta, type SlotMeta } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

/** One meta file read back; a file that is not JSON is dropped like any other malformed meta. */
function parseMeta(meta: string): SlotMeta | null {
  try {
    return toSlotMeta(JSON.parse(meta));
  } catch {
    return null;
  }
}

async function writeNow(meta: SlotMeta, save: StoredSave): Promise<void> {
  const { id } = meta;
  if (typeof save === "string") {
    await invoke("write_slot", { id, meta: JSON.stringify(meta), save });
    return;
  }
  const [hashes, held] = await Promise.all([hashShards(save), invoke<Record<string, string> | null>("slot_shard_hashes", { id })]);
  const changed = Object.fromEntries(Object.entries(save).filter(([name]) => held?.[name] !== hashes[name]));
  await invoke("write_slot_shards", { id, meta: JSON.stringify(meta), hashes, changed });
}

/** Saves as files under the app data folder, through the commands in `src-tauri/src/slots.rs`. */
export function tauriSlots(): SlotStore {
  // Each write sends only what differs from the slot as the write before it left it, so writes wait their turn.
  let writing: Promise<void> = Promise.resolve();

  return {
    async list() {
      const metas = await invoke<string[]>("list_slots");
      return newestFirst(metas.map(parseMeta).filter((meta) => meta !== null));
    },
    async write(meta, save) {
      assertSlotId(meta.id);
      const written = writing.then(() => writeNow(meta, save));
      writing = written.catch(() => undefined);
      return written;
    },
    read(id) {
      assertSlotId(id);
      return invoke<StoredSave>("read_slot", { id });
    },
    async remove(id) {
      assertSlotId(id);
      await invoke("delete_slot", { id });
    },
  };
}
