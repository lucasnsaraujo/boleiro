import { invoke } from "@tauri-apps/api/core";
import { assertSlotId, newestFirst, toSlotMeta } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

/** Saves as files under the app data folder, through the commands in `src-tauri/src/slots.rs`. */
export function tauriSlots(): SlotStore {
  return {
    async list() {
      const metas = await invoke<string[]>("list_slots");
      return newestFirst(metas.map((meta): unknown => JSON.parse(meta)).map(toSlotMeta).filter((meta) => meta !== null));
    },
    async write(meta, save) {
      assertSlotId(meta.id);
      await invoke("write_slot", { id: meta.id, meta: JSON.stringify(meta), save });
    },
    read(id) {
      assertSlotId(id);
      return invoke<string>("read_slot", { id });
    },
    async remove(id) {
      assertSlotId(id);
      await invoke("delete_slot", { id });
    },
  };
}
