import { isTauri } from "@tauri-apps/api/core";
import type { StoredSave } from "../engine/sessionSave.js";
import { indexedDbSlots } from "./indexedDbSlots.js";
import type { SlotMeta } from "./slotMeta.js";
import { tauriSlots } from "./tauriSlots.js";

export type SlotStore = {
  list(): Promise<SlotMeta[]>;
  /**
   * Creates the slot, or replaces it when the id already exists. A save in shards writes only the shards that
   * changed since the slot's last save; the slot switches to the new save whole or, if the write fails, not at all.
   */
  write(meta: SlotMeta, save: StoredSave): Promise<void>;
  /** The save as written: its shards, or the string of a save written whole, as before shards. */
  read(id: string): Promise<StoredSave>;
  remove(id: string): Promise<void>;
};

/** Saves on disk under the app data folder in the desktop app, in IndexedDB on the web build. */
export function slotStore(): SlotStore {
  return isTauri() ? tauriSlots() : indexedDbSlots();
}
