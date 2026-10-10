import type { EngineClient } from "../engine/connectEngine.js";
import type { GameSummary } from "../engine/createEngineSession.js";
import type { SlotStore } from "./slotStore.js";

export async function saveToSlot(engine: EngineClient, slots: SlotStore, slot: { id: string; name: string }, now = new Date()): Promise<void> {
  const [save, summary] = await Promise.all([engine.save(), engine.read(["date", "season", "coachClubId"])]);
  await slots.write({ ...slot, savedAt: now.toISOString(), ...summary }, save);
}

export async function loadFromSlot(engine: EngineClient, slots: SlotStore, id: string): Promise<GameSummary> {
  return engine.load(await slots.read(id));
}
