import type { EngineClient } from "../engine/connectEngine.js";
import type { CommandResults, CommandType, GameCommand } from "../engine/createEngineSession.js";
import type { CurrentGameRef } from "./currentGame.js";
import { saveToSlot } from "./saveToSlot.js";
import { AUTOSAVE_SLOT_ID } from "./slotMeta.js";
import type { SlotStore } from "./slotStore.js";

// A live autosave writes only the minute shown, since the game and the live day stay as at kick-off, but it still
// splits and hashes the whole save (about 5.5 MB), so a round shown at 4x is saved every quarter of an hour, not
// every minute. Leaving mid-match then rewinds at most this far, and changes still can't go back before the minute saved.
const LIVE_SAVE_EVERY_MINUTES = 15;

/** What the game a command left behind asks of the autosave: a write now, none though it moved on, or none since it did not. */
type Outcome = "autosave" | "changed" | "unchanged";

const OUTCOME_OF: { [T in CommandType]: (command: GameCommand<T>, result: CommandResults[T]) => Outcome } = {
  // A new or loaded game takes the open one's place; whoever opens it on the screens starts it afresh, saved in its slot.
  newGame: () => "unchanged",
  load: () => "unchanged",
  advance: ({ days }, { events }) => (days.some((day) => day.acceptOffer !== undefined) || events.some((event) => event.type === "matchPlayed") ? "autosave" : "changed"),
  // Days that stop for a job offer or the window may have no match anywhere; they still move the game on.
  playToMatchDay: (_command, { daysPlayed }) => (daysPlayed > 0 ? "autosave" : "unchanged"),
  startRound: () => "autosave",
  seeMinute: ({ minute }) => (minute % LIVE_SAVE_EVERY_MINUTES === 0 ? "autosave" : "changed"),
  changeLive: () => "autosave",
  finishRound: () => "autosave",
  closeTurningPoint: () => "autosave",
  declineOffer: () => "autosave",
  ask: () => "autosave",
  withdraw: () => "autosave",
  listPlayer: () => "autosave",
  answerBid: () => "autosave",
  declineCounter: () => "autosave",
  priceTickets: () => "autosave",
  // A refusal leaves the game as it was.
  askStadiumWorks: (_command, { approved }) => (approved ? "autosave" : "unchanged"),
  takeBankLoan: (_command, { approved }) => (approved ? "autosave" : "unchanged"),
  repayBankLoan: () => "autosave",
  bookFriendly: (_command, { booked }) => (booked ? "autosave" : "unchanged"),
};

/**
 * The engine, writing the autosave slot after every advance that played a round of matches or signed an offer, every
 * play-on that moved the game, every kick-off and live change of a live round and every quarter of an hour shown of
 * it, every live round's final whistle, every offer turned down, every request asked or withdrawn, every player listed, every club's offer answered, every counter turned down, every ticket price set, every stadium works the board approved, every bank loan taken or paid off, every friendly booked, and every turning point closed. Autosaves go one
 * at a time; those asked for while one is under way become a single save of the latest game. Every change, autosaved
 * or not, counts in the open game's unsaved changes.
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
    async apply(command) {
      const result = await engine.apply(command);
      const outcome = OUTCOME_OF[command.type](command, result);
      const open = game.current;
      if (open && outcome !== "unchanged") open.unsavedChanges = (open.unsavedChanges ?? 0) + 1;
      if (outcome === "autosave") await autosave();
      return result;
    },
  };
}
