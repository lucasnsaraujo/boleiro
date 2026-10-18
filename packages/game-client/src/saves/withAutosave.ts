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
  resign: () => "autosave",
  // Only an application that brings an offer changes the game.
  applyForJob: (_command, answer) => (answer === "offered" ? "autosave" : "unchanged"),
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
  promoteProspect: (_command, { refusal }) => (refusal ? "unchanged" : "autosave"),
  releaseProspect: (_command, { refusal }) => (refusal ? "unchanged" : "autosave"),
  sellProspect: (_command, { refusal }) => (refusal ? "unchanged" : "autosave"),
  passTurn: () => "autosave",
  // The clock ticks every second on the market screens; the next autosave keeps it.
  spendMarketTime: (_command, clock) => (clock ? "changed" : "unchanged"),
  answerEvent: () => "autosave",
  handToAssistant: () => "autosave",
  setAssistantDuty: () => "autosave",
  hireAssistant: (_command, { refusal }) => (refusal ? "unchanged" : "autosave"),
  fireAssistant: () => "autosave",
  nameCaptain: () => "autosave",
  watchPlayer: () => "autosave",
  saveFilter: () => "autosave",
  deleteFilter: () => "autosave",
  signSponsor: () => "autosave",
  pickSponsors: () => "autosave",
  retirePlayer: () => "autosave",
  persuadeToStay: () => "autosave",
  acceptNationalJob: () => "autosave",
  declineNationalJob: () => "autosave",
  setCallUp: () => "autosave",
  // A coach egg found before leaves the game as it was.
  findEgg: (_command, found) => (found ? "autosave" : "unchanged"),
  closeMoment: () => "autosave",
  retireCoach: () => "autosave",
};

/**
 * The engine, writing the autosave slot after every advance that played a round of matches or signed an offer, every
 * play-on that moved the game, every kick-off and live change of a live round and every quarter of an hour shown of
 * it, every live round's final whistle, every offer turned down, every resignation and every application that brought an offer, every request asked or withdrawn, every player listed, every club's offer answered, every counter turned down, every ticket price set, every stadium works the board approved, every bank loan taken or paid off, every friendly booked, every hot-seat turn passed, every academy kid promoted, released or sold, every event answered, every area handed to or taken back from the assistant, every assistant hired or let go, every player watched or unwatched, every market search saved or
 * forgotten, every player retired or asked to stay, every sponsor signed, every switch of who picks the sponsors, every turning point and career moment closed, and the coach's retirement. Autosaves go one
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
