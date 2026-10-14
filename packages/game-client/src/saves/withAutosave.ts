import type { EngineClient } from "../engine/connectEngine.js";
import type { CurrentGameRef } from "./currentGame.js";
import { saveToSlot } from "./saveToSlot.js";
import { AUTOSAVE_SLOT_ID } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

// guess: a live save is about 6 MB, so a round shown at 4x is saved every quarter of an hour, not every minute.
// Leaving mid-match then rewinds at most this far, and changes still can't go back before the minute saved.
const LIVE_SAVE_EVERY_MINUTES = 15;

/**
 * The engine, writing the autosave slot after every advance that played a round of matches or signed an offer, every
 * play-on that moved the game, every kick-off and live change of a live round and every quarter of an hour shown of
 * it, every live round's final whistle, every offer turned down, every request asked or withdrawn, and every turning point closed. Autosaves go one
 * at a time; those asked for while one is under way become a single save of the latest game.
 */
export function withAutosave(engine: EngineClient, slots: SlotStore, game: CurrentGameRef): EngineClient {
  let lastSave: Promise<void> = Promise.resolve();
  let nextSave: Promise<void> | null = null;

  async function saveNow() {
    nextSave = null;
    const open = game.current;
    // The round is already played in the worker; failing here would make callers retry and play it twice.
    if (open) await saveToSlot(engine, slots, AUTOSAVE_SLOT_ID, open).catch(() => undefined);
  }

  function autosave(): Promise<void> {
    nextSave ??= lastSave.then(saveNow);
    lastSave = nextSave;
    return nextSave;
  }

  return {
    ...engine,
    async advance(days) {
      const result = await engine.advance(days);
      const hasSigned = days.some((day) => day.acceptOffer !== undefined);
      if (hasSigned || result.events.some((event) => event.type === "matchPlayed")) await autosave();
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
    async ask(request) {
      const desk = await engine.ask(request);
      await autosave();
      return desk;
    },
    async withdraw(playerId) {
      const desk = await engine.withdraw(playerId);
      await autosave();
      return desk;
    },
    async closeTurningPoint() {
      await engine.closeTurningPoint();
      await autosave();
    },
    async startRound(kickOff) {
      const round = await engine.startRound(kickOff);
      await autosave();
      return round;
    },
    async seeMinute(minute) {
      await engine.seeMinute(minute);
      if (minute % LIVE_SAVE_EVERY_MINUTES === 0) await autosave();
    },
    async changeLive(minute, change) {
      const round = await engine.changeLive(minute, change);
      await autosave();
      return round;
    },
    async finishRound() {
      const result = await engine.finishRound();
      await autosave();
      return result;
    },
  };
}
