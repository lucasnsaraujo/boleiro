import type { EngineClient } from "../engine/connectEngine.js";
import type { CurrentGameRef } from "./currentGame.js";
import { saveToSlot } from "./saveToSlot.js";
import { AUTOSAVE_SLOT_ID } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

/** The engine, writing the autosave slot after every advance that played a round of matches. */
export function withAutosave(engine: EngineClient, slots: SlotStore, game: CurrentGameRef): EngineClient {
  return {
    ...engine,
    async advance(days) {
      const result = await engine.advance(days);
      const open = game.current;
      if (open && result.events.some((event) => event.type === "matchPlayed")) {
        await saveToSlot(engine, slots, { id: AUTOSAVE_SLOT_ID, coachName: open.coachName });
      }
      return result;
    },
  };
}
