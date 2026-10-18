import type { Club } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import type { GameSummary } from "../engine/createEngineSession.js";
import { compareText } from "@boleiro/engine/sim/compareText";

/**
 * What the slot list shows without opening the save itself. `division` is the coach's club's when saved, and
 * `abroad` the country and level a club abroad played at (saves written before it was kept have none);
 * `gameSlotId` is the slot the game was started in, which differs from `id` in the autosave.
 */
export type SlotMeta = GameSummary & { id: string; gameSlotId: string; savedAt: string; coachName: string; division: Division | null; abroad?: NonNullable<Club["abroad"]> };

export const AUTOSAVE_SLOT_ID = "autosave";

/** The slots a new game can go into; the autosave slot is written only by the game. */
export const GAME_SLOT_IDS = ["slot-1", "slot-2", "slot-3"] as const;

export type GameSlot = { id: string; label: string; meta: SlotMeta | null };

export function slotLabel(id: string): string {
  if (id === AUTOSAVE_SLOT_ID) return "Automático";
  const index = GAME_SLOT_IDS.findIndex((slotId) => slotId === id);
  return index >= 0 ? `Jogo ${index + 1}` : id;
}

/** The new-game slots in order, each with the game it holds, if any. */
export function gameSlots(saved: readonly SlotMeta[]): GameSlot[] {
  return GAME_SLOT_IDS.map((id) => ({ id, label: slotLabel(id), meta: saved.find((meta) => meta.id === id) ?? null }));
}

// Slot ids become file names on desktop, so they never carry dots or slashes.
const SLOT_ID = /^[a-z0-9-]{1,64}$/;
const DIVISIONS: readonly Division[] = ["A", "B", "C", "D"];

export function assertSlotId(id: string): void {
  if (!SLOT_ID.test(id)) throw new Error(`invalid slot id "${id}"`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDivision(value: unknown): value is Division {
  return DIVISIONS.some((division) => division === value);
}

/** Slot metadata read back from disk; anything malformed is dropped rather than shown. */
export function toSlotMeta(value: unknown): SlotMeta | null {
  if (!isRecord(value)) return null;
  const { id, gameSlotId, savedAt, coachName, date, season, coachClubId, division, abroad } = value;
  if (typeof id !== "string" || !SLOT_ID.test(id)) return null;
  if (typeof gameSlotId !== "string" || !SLOT_ID.test(gameSlotId)) return null;
  if (typeof coachName !== "string" || typeof savedAt !== "string" || typeof date !== "string") return null;
  if (typeof season !== "number" || (coachClubId !== null && typeof coachClubId !== "string")) return null;
  if (division !== null && !isDivision(division)) return null;
  const meta = { id, gameSlotId, savedAt, coachName, date, season, coachClubId, division };
  return isRecord(abroad) && typeof abroad.country === "string" && typeof abroad.level === "number" ? { ...meta, abroad: { country: abroad.country, level: abroad.level } } : meta;
}

export function newestFirst(slots: SlotMeta[]): SlotMeta[] {
  return slots.toSorted((a, b) => compareText(b.savedAt, a.savedAt));
}
