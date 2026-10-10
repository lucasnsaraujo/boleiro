import type { EngineClient } from "../engine/connectEngine.js";
import type { CurrentGameRef } from "./currentGame.js";
import { saveToSlot } from "./saveToSlot.js";
import { AUTOSAVE_SLOT_ID } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

/** The engine, writing the autosave slot after every advance that played a round of matches, every play-on that moved the game, every live round's final whistle and every offer turned down. */
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
      // Days that stop for a job offer or the window may have no match anywhere; they still move the game on.
      if (result.daysPlayed > 0) await autosave();
      return result;
    },
    async declineOffer(clubId) {
      await engine.declineOffer(clubId);
      await autosave();
    },
    async finishRound() {
      const result = await engine.finishRound();
      await autosave();
      return result;
    },
  };
}
