import type { EngineClient } from "../engine/connectEngine.js";
import type { GameSummary } from "../engine/createEngineSession.js";
import type { CurrentGame } from "./currentGame.js";
import type { SlotStore } from "./slotStore.js";

/**
 * Writes the open game into slot `id`, remembering the slot the game itself lives in for when it is reopened. Written
 * into that slot of its own, the game has no unsaved play left, unless a change came back while it was being written.
 */
export async function saveToSlot(engine: EngineClient, slots: SlotStore, id: string, game: CurrentGame, now = new Date()): Promise<void> {
  const changesWritten = game.unsavedChanges;
  const [save, { clubs, ...summary }] = await Promise.all([engine.saveShards(), engine.read(["date", "season", "coachClubId", "clubs"])]);
  const division = summary.coachClubId ? (clubs[summary.coachClubId]?.division ?? null) : null;
  await slots.write({ id, gameSlotId: game.slotId, coachName: game.coachName, savedAt: now.toISOString(), ...summary, division }, save);
  if (id === game.slotId && changesWritten !== undefined && game.unsavedChanges === changesWritten) game.unsavedChanges = 0;
}

export async function loadFromSlot(engine: EngineClient, slots: SlotStore, id: string): Promise<GameSummary> {
  return engine.apply({ type: "load", save: await slots.read(id) });
}
