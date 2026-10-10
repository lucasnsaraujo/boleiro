import type { EngineClient } from "../engine/connectEngine.js";
import type { GameSummary } from "../engine/createEngineSession.js";
import type { SlotStore } from "./slotStore.js";

export async function saveToSlot(engine: EngineClient, slots: SlotStore, slot: { id: string; coachName: string }, now = new Date()): Promise<void> {
  const [save, { clubs, ...summary }] = await Promise.all([engine.save(), engine.read(["date", "season", "coachClubId", "clubs"])]);
  const division = summary.coachClubId ? (clubs[summary.coachClubId]?.division ?? null) : null;
  await slots.write({ ...slot, savedAt: now.toISOString(), ...summary, division }, save);
}

export async function loadFromSlot(engine: EngineClient, slots: SlotStore, id: string): Promise<GameSummary> {
  return engine.load(await slots.read(id));
}
