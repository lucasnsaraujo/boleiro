import type { EngineClient } from "../engine/connectEngine.js";
import type { CurrentGameRef } from "./currentGame.js";
import { saveToSlot } from "./saveToSlot.js";
import { AUTOSAVE_SLOT_ID } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

/** The engine, writing the autosave slot after every call that played a round of matches. */
export function withAutosave(engine: EngineClient, slots: SlotStore, game: CurrentGameRef): EngineClient {
  async function autosave() {
    const open = game.current;
    // The round is already played in the worker; failing here would make callers retry and play it twice.
    if (open) await saveToSlot(engine, slots, AUTOSAVE_SLOT_ID, open).catch(() => undefined);
  }

  return {
    ...engine,
    async advance(days) {
      const result = await engine.advance(days);
      if (result.events.some((event) => event.type === "matchPlayed")) await autosave();
      return result;
    },
    async playToMatchDay() {
      const result = await engine.playToMatchDay();
      if (result.matchesPlayed > 0) await autosave();
      return result;
    },
  };
}
