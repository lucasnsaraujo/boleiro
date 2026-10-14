import { isTauri } from "@tauri-apps/api/core";
import { indexedDbSlots } from "./indexedDbSlots.js";
import type { SlotMeta } from "./slotMeta.js";
import { tauriSlots } from "./tauriSlots.js";

export type SlotStore = {
  list(): Promise<SlotMeta[]>;
  /** Creates the slot, or replaces it when the id already exists. */
  write(meta: SlotMeta, save: string): Promise<void>;
  read(id: string): Promise<string>;
  remove(id: string): Promise<void>;
};

/** Saves on disk under the app data folder in the desktop app, in IndexedDB on the web build. */
export function slotStore(): SlotStore {
  return isTauri() ? tauriSlots() : indexedDbSlots();
}
