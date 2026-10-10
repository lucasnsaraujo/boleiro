import type { GameSummary } from "../engine/createEngineSession.js";

/** What the slot list shows without opening the save itself. */
export type SlotMeta = GameSummary & { id: string; name: string; savedAt: string };

export const AUTOSAVE_SLOT_ID = "autosave";

// Slot ids become file names on desktop, so they never carry dots or slashes.
const SLOT_ID = /^[a-z0-9-]{1,64}$/;

export function assertSlotId(id: string): void {
  if (!SLOT_ID.test(id)) throw new Error(`invalid slot id "${id}"`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Slot metadata read back from disk; anything malformed is dropped rather than shown. */
export function toSlotMeta(value: unknown): SlotMeta | null {
  if (!isRecord(value)) return null;
  const { id, name, savedAt, date, season, coachClubId } = value;
  if (typeof id !== "string" || !SLOT_ID.test(id)) return null;
  if (typeof name !== "string" || typeof savedAt !== "string" || typeof date !== "string") return null;
  if (typeof season !== "number" || (coachClubId !== null && typeof coachClubId !== "string")) return null;
  return { id, name, savedAt, date, season, coachClubId };
}

export function newestFirst(slots: SlotMeta[]): SlotMeta[] {
  return slots.toSorted((a, b) => b.savedAt.localeCompare(a.savedAt));
}
