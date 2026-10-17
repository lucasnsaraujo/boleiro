import type { Formation } from "@boleiro/engine/engine/formations";
import { advanceDay, type DayDecisions, type DayEvent, type DayResult, type WaitingDecisions } from "@boleiro/engine/sim/advanceDay";
import { fireAssistant, hireAssistant, type AssistantRefusal } from "@boleiro/engine/sim/coach/assistant";
import { withAssistantDuty, type AssistantDuty } from "@boleiro/engine/sim/coach/assistantDuties";
import { declineOffer } from "@boleiro/engine/sim/coach/declineOffer";
import { withCoachWorld } from "@boleiro/engine/sim/coach/aiCoaches";
import { applyForJob, type JobAnswer } from "@boleiro/engine/sim/coach/applyForJob";
import { resign } from "@boleiro/engine/sim/coach/resign";
import { nameCaptain } from "@boleiro/engine/sim/chemistry/nameCaptain";
import { pendingEventOf, type EventArea, type PendingEvent } from "@boleiro/engine/sim/events/eventMemory";
import type { EggFound } from "@boleiro/engine/sim/eggs/eggBook";
import { findCoachEgg } from "@boleiro/engine/sim/eggs/findEggs";
import { answerEvent, type EventAnswered } from "@boleiro/engine/sim/events/runEvents";
import { passTheSeat, swapSeat, waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { applyLiveChange, type LiveChange } from "@boleiro/engine/sim/live/applyLiveChange";
import { finishMatchDay } from "@boleiro/engine/sim/live/finishMatchDay";
import type { LiveDay } from "@boleiro/engine/sim/live/liveDay";
import { startMatchDay } from "@boleiro/engine/sim/live/startMatchDay";
import { withPackPositions } from "@boleiro/engine/sim/players/withPackPositions";
import { persuadeToStay, retirePlayer, type PlayerPersuaded } from "@boleiro/engine/sim/players/retirement";
import { newGameFromFiles, type GameFiles } from "@boleiro/engine/sim/loadNewGame";
import type { NewGameOptions } from "@boleiro/engine/sim/newGame";
import { answerBid, type BidAnswer, type BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { declineCounter } from "@boleiro/engine/sim/transfers/coachMarket";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { listPlayer, type SaleWay } from "@boleiro/engine/sim/transfers/listPlayer";
import { setTicketPrice, withAssistantPricing } from "@boleiro/engine/sim/finances/setTicketPrice";
import { repayBankLoan, takeBankLoan, type BankLoanAnswer } from "@boleiro/engine/sim/finances/bankLoan";
import { bookFriendly, type FriendlyAnswer } from "@boleiro/engine/sim/friendlies/friendlies";
import { requestStadiumWorks, type WorksAnswer } from "@boleiro/engine/sim/stadium/stadiumWorks";
import { promoteProspect, releaseProspect, sellProspect, type ProspectRefusal, type ProspectSold } from "@boleiro/engine/sim/youth/moveProspect";
import { seedGameSponsors, signSponsorOffer } from "@boleiro/engine/sim/sponsors/sponsorDeals";
import { eventsOfWaitingCoach, hotSeatViewOf, isHumanMatchDay, type HotSeatView } from "../hub/hotSeat.js";
import { inboxLines, type InboxLine } from "../hub/inboxLines.js";
import { isCoachMatchDay, playToMatchDay, stopReason, type StopReason } from "../hub/playToMatchDay.js";
import { turningPointsOf, type TurningPoint } from "../hub/turningPoints.js";
import { boardNotes, dueRequests, EMPTY_DESK, withoutLeavers, withRequest, type BoardDesk } from "../market/boardDesk.js";
import type { MarketFilters } from "../market/marketFilters.js";
import { EMPTY_SCOUTING, forgetFilter, keepFilter, watch, type Scouting } from "../market/scouting.js";
import { isSigning, marketClockView, spendMarketTime, type MarketClock, type MarketClockView } from "../market/marketClock.js";
import { assistantPage, type AssistantPage } from "../assistant/assistantPage.js";
import { awardsBook, type AwardsBook } from "../awards/awardsBook.js";
import { chemistryPage, type ChemistryPage } from "../chemistry/chemistryPage.js";
import { coachesPage, coachProfile, type CoachesPage, type CoachProfile } from "../coaches/coachesPage.js";
import { eggAlbumOf, type EggAlbum } from "../eggs/eggAlbum.js";
import { matchPageOf, type MatchPage } from "../matchPage/matchPageOf.js";
import { liveRoundOf, type LiveRound } from "../round/liveRoundOf.js";
import { matchDayPlan, type MatchDayPlan } from "../round/matchDayPlan.js";
import { newspaperEditions, newspaperOf, type Edition, type EditionTitle } from "../newspaper/roundNewspaper.js";
import { betStickerOf, sponsorsPageOf, type BetSticker, type SponsorsPage } from "../sponsors/sponsorsPage.js";
import { readStoredSave, splitGame, writeSessionSave, writeSessionShards, type SaveShards, type SeatParts, type SplitGame, type StoredSave } from "./sessionSave.js";

/** What a new game is started with; the app's new-game screen leaves `season` out, for the first season. */
export type NewGameChoices = Pick<NewGameOptions, "coachClubId" | "careerMode" | "stateChampionships" | "midSeasonWindow" | "hotSeat" | "coachName" | "marketClockSeconds" | "formats" | "season">;
export type GameSummary = Pick<GameState, "date" | "season" | "coachClubId">;
export type AdvanceResult = { date: IsoDate; events: DayEvent[] };
export type PlayResult = { date: IsoDate; stop: StopReason; daysPlayed: number };
/** The coach's eleven and tactics for kick-off; left out, the assistant's pick and his last tactics. */
export type KickOff = Pick<DayDecisions, "lineup" | "tactics">;
/** What a hot-seat coach leaves for the day when he passes his turn: his eleven and tactics, or the job offer he takes. */
export type TurnChoice = Pick<DayDecisions, "lineup" | "tactics" | "acceptOffer">;

/** What each command carries besides its `type`. */
type CommandFields = {
  newGame: { seed: number; choices: NewGameChoices };
  /** Replaces the whole session with the one a save holds, in shards or written whole. */
  load: { save: StoredSave };
  /** Plays one day per entry, each with the coach's decisions for that day. */
  advance: { days: readonly DayDecisions[] };
  playToMatchDay: Record<never, never>;
  startRound: KickOff;
  seeMinute: { minute: number };
  /** A change in a human coach's match: the seated coach's, or with `clubId` a waiting hot-seat coach's. */
  changeLive: { minute: number; change: LiveChange; clubId?: string };
  finishRound: Record<never, never>;
  closeTurningPoint: Record<never, never>;
  declineOffer: { clubId: string };
  /** The coach in the seat walks out on his club. */
  resign: Record<never, never>;
  /** The coach in the seat applies for a club's open job; the club answers at once. */
  applyForJob: { clubId: string };
  ask: { request: CoachRequest };
  withdraw: { playerId: string };
  /** Puts one of the coach's players up for sale or at auction, or takes him off the market with `way` null. */
  listPlayer: { playerId: string; way: SaleWay | null };
  answerBid: { playerId: string; answer: BidAnswer };
  /** Turns down a selling club's counter to the coach's offer. */
  declineCounter: { playerId: string };
  /** Sets the ticket price of the coach's home games, in whole reais. */
  priceTickets: { price: number };
  /** Asks the board for `seats` new seats at the coach's stadium; it answers at once. */
  askStadiumWorks: { seats: number };
  /** Borrows `amount` from the bank for the coach's club, repaid in `months` monthly instalments; the bank answers at once. */
  takeBankLoan: { amount: number; months: number };
  /** Pays off the coach's club's bank loan from cash. */
  repayBankLoan: Record<never, never>;
  /** Books a friendly for the coach's club against `opponentId` on `date`; the other club answers at once. */
  bookFriendly: { opponentId: string; date: IsoDate; isHome: boolean };
  /** Moves a kid of the coach's academy into his squad. */
  promoteProspect: { prospectId: string };
  /** Lets a kid of the coach's academy go. */
  releaseProspect: { prospectId: string };
  /** Sells a kid of the coach's academy to the club that wants him most. */
  sellProspect: { prospectId: string };
  /**
   * Ends the turn of a hot-seat coach who is not the last of it: his eleven and tactics wait for the
   * day, and the next coach in turn order takes the seat.
   */
  passTurn: TurnChoice;
  /**
   * The coach in the seat spent `seconds` more on the market screens; on a player's page (`playerId`)
   * only when the player is not his. The clock runs only in a game with it and inside a window.
   */
  spendMarketTime: { seconds: number; playerId?: string };
  /** The coach in the seat answers the event waiting for him with answer `choice`, or leaves it to his assistant with null. */
  answerEvent: { choice: number | null };
  /** From now on the assistant answers the events of `area` for the coach in the seat (`isHanded`), or stops doing it. */
  handToAssistant: { area: EventArea; isHanded: boolean };
  /** The assistant runs `duty` for the coach in the seat from now on (`isOn`), or stops doing it; handed back the ticket price, he sets his own at once. */
  setAssistantDuty: { duty: AssistantDuty; isOn: boolean };
  /** The coach in the seat hires one of the assistant's screen's candidates in place of his assistant; his board answers at once. */
  hireAssistant: { candidateId: string };
  /** The coach in the seat lets his hired assistant go; his club's own takes over. */
  fireAssistant: Record<never, never>;
  /** The coach in the seat hands the armband to one of his players. */
  nameCaptain: { playerId: string };
  /** The coach in the seat puts a player on his watch list (`isWatched`) or takes him off it. */
  watchPlayer: { playerId: string; isWatched: boolean };
  /** The coach in the seat keeps a market search under `name`, in place of one saved under it before. */
  saveFilter: { name: string; filters: MarketFilters };
  /** The coach in the seat forgets the market search saved under `name`. */
  deleteFilter: { name: string };
  /** The coach in the seat signs one of his club's sponsor offers; the brand goes on the kit today. */
  signSponsor: { offerId: string };
  /** The coach in the seat picks his club's sponsors himself (`isPicking`), or leaves them to the board again. */
  pickSponsors: { isPicking: boolean };
  /** The coach in the seat retires one of his players now. */
  retirePlayer: { playerId: string };
  /** The coach in the seat asks one of his players who announced his last season to play one more year. */
  persuadeToStay: { playerId: string };
  /** The coach in the seat found an easter egg on the screen (a word typed). */
  findEgg: { eggId: string };
};

/** What a move on a kid of the academy answers: null when it went through, and the sale it made. */
export type ProspectAnswer = { refusal: ProspectRefusal | null; sale?: ProspectSold };

export type CommandType = keyof CommandFields;

/**
 * Something the coach does to the game, as plain data: the only way a session's game changes.
 * Each one survives JSON, so the same commands applied from the same seed rebuild the same game.
 */
export type GameCommand<T extends CommandType = CommandType> = { [K in T]: { type: K } & CommandFields[K] }[T];

/** What applying each command answers. */
export type CommandResults = {
  newGame: GameSummary;
  load: GameSummary;
  advance: AdvanceResult;
  playToMatchDay: PlayResult;
  startRound: LiveRound;
  seeMinute: undefined;
  changeLive: LiveRound;
  finishRound: AdvanceResult;
  closeTurningPoint: undefined;
  declineOffer: undefined;
  resign: undefined;
  applyForJob: JobAnswer;
  ask: BoardDesk;
  withdraw: BoardDesk;
  listPlayer: undefined;
  answerBid: BidOutcome;
  declineCounter: undefined;
  priceTickets: undefined;
  askStadiumWorks: WorksAnswer;
  takeBankLoan: BankLoanAnswer;
  repayBankLoan: undefined;
  bookFriendly: FriendlyAnswer;
  promoteProspect: ProspectAnswer;
  releaseProspect: ProspectAnswer;
  sellProspect: ProspectAnswer;
  passTurn: HotSeatView;
  spendMarketTime: MarketClockView | null;
  answerEvent: EventAnswered;
  handToAssistant: undefined;
  setAssistantDuty: undefined;
  hireAssistant: { refusal: AssistantRefusal | null };
  fireAssistant: undefined;
  nameCaptain: undefined;
  watchPlayer: Scouting;
  saveFilter: Scouting;
  deleteFilter: Scouting;
  signSponsor: SponsorsPage | null;
  pickSponsors: undefined;
  retirePlayer: undefined;
  persuadeToStay: PlayerPersuaded;
  findEgg: EggFound | null;
};

// guess: a season's busiest stretch gives the coach a few dozen lines; older ones are no longer news.
const INBOX_SIZE = 40;
// guess: the market and finances screens show a handful of the board's latest answers and sales.
const DESK_ANSWERS = 20;
const DESK_FORCED_SALES = 10;

function summaryOf({ date, season, coachClubId }: GameState): GameSummary {
  return { date, season, coachClubId };
}

/** A coach's scouting as a save keeps it: left out while he has none. */
function scoutingToSave(scouting: Scouting): { scouting?: Scouting } {
  return scouting.watchList.length || scouting.savedFilters.length ? { scouting } : {};
}

function pick<T, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const slice = {} as Pick<T, K>;
  for (const key of keys) slice[key] = source[key];
  return slice;
}

/**
 * The game the worker holds. It changes only through `apply`, one command at a time; everything
 * else reads it. Everything that runs the sim goes through here, off the main thread.
 */
export function createEngineSession(files: GameFiles) {
  let state: GameState | null = null;
  /** What happened to the coach since he last played on, oldest first. */
  let news: InboxLine[] = [];
  /** The coach's requests waiting for the board, and what the board did; saved with the game. */
  let desk: BoardDesk = EMPTY_DESK;
  /** The coach's match day between kick-off and the final whistle, and the furthest minute the screen has shown of it. */
  let live: { day: LiveDay; seenMinute: number } | null = null;
  /** The match day last finished, whose matches keep their real timelines on their pages until another day is played. */
  let lastRound: LiveDay | null = null;
  /** Firings and season ends the coach has not closed the screen on yet, oldest first; saved with the game. */
  let turningPoints: TurningPoint[] = [];
  /** The game as last saved in shards, whose unchanged countries the next save reuses. */
  let split: SplitGame | null = null;
  /** The time the coach in the seat spent on the market screens this window; saved with the game. */
  let clock: MarketClock | null = null;
  /** The watch list and saved searches of the coach in the seat; saved with the game. */
  let scouting: Scouting = EMPTY_SCOUTING;
  /** Each waiting hot-seat coach's inbox, desk, turning points, clock and scouting, in the game's waiting order; none in a one-coach game. */
  let waiting: SeatParts[] = [];
  /** The place in turn order of the hot-seat coach in the seat. */
  let seated = 0;
  /** The eleven and tactics of the hot-seat coaches who passed their turn, by place in turn order. */
  let passed: TurnChoice[] = [];

  function underWay() {
    if (!live) throw new Error("no match day is under way");
    return live;
  }

  /**
   * The game, for a command that changes it outside a day. Refused during a round, whose final whistle
   * rebuilds the game from the kick-off copy and would undo the change.
   */
  function betweenDays(refusal: string): GameState {
    if (live) throw new Error(`${refusal} while a match day is under way`);
    return current();
  }

  function current(): GameState {
    if (!state) throw new Error("no game is loaded");
    return state;
  }

  function begin(next: GameState): GameSummary {
    state = next;
    news = [];
    desk = EMPTY_DESK;
    live = null;
    lastRound = null;
    turningPoints = [];
    split = null;
    clock = null;
    scouting = EMPTY_SCOUTING;
    waiting = waitingCoachesOf(next).map(() => ({ news: [], desk: EMPTY_DESK, turningPoints: [], clock: null }));
    seated = 0;
    passed = [];
    return summaryOf(next);
  }

  /** Hands the seat to the next coach in turn order; the one who sat goes to the back of the line with his part of the session. */
  function rotateSeat() {
    const [next, ...rest] = waiting;
    if (!next) return;
    waiting = [...rest, { news, desk, turningPoints, clock, ...scoutingToSave(scouting) }];
    ({ news, desk, turningPoints, clock } = next);
    scouting = next.scouting ?? EMPTY_SCOUTING;
    state = passTheSeat(current());
    seated = (seated + 1) % (waiting.length + 1);
  }

  /** After a day played, the turn starts over with the first coach in turn order in the seat. */
  function startTurnOver() {
    passed = [];
    while (seated !== 0) rotateSeat();
  }

  /** Each waiting coach's decisions for the day: what he chose on his turn and his requests due today. */
  function waitingDecisions(before: GameState): WaitingDecisions[] {
    return waiting.map((parts, index) => {
      const { due } = dueRequests(swapSeat(before, index), parts.desk.pending);
      const own = passed[(seated + 1 + index) % (waiting.length + 1)] ?? {};
      return due.length ? { ...own, requests: due } : own;
    });
  }

  /** Takes the requests a day handed each waiting coach's board off his desk, once the day is played. */
  function dropSentRequests(decisions: readonly WaitingDecisions[] | undefined) {
    waiting = waiting.map((parts, index) => {
      const sent = new Set((decisions?.[index]?.requests ?? []).map((request) => request.playerId));
      return sent.size ? { ...parts, desk: { ...parts.desk, pending: parts.desk.pending.filter((request) => !sent.has(request.playerId)) } } : parts;
    });
  }

  /** Plays one day for every coach: the seated coach's `decisions` and each waiting coach's; his news and desk follow it. */
  function playDay(before: GameState, decisions: DayDecisions): { day: DayResult; stop: StopReason | null } {
    if (!waiting.length) return { day: advanceDay(before, decisions), stop: null };
    const withWaiting = { ...decisions, waiting: waitingDecisions(before) };
    const day = advanceDay(before, withWaiting);
    dropSentRequests(withWaiting.waiting);
    return { day, stop: tellWaitingCoaches(before, day) };
  }

  /** Runs `change`; if it throws, the waiting coaches' parts of the session go back to how they were. */
  function keepingSeatsOnFailure<T>(change: () => T): T {
    const before = waiting;
    try {
      return change();
    } catch (error) {
      waiting = before;
      throw error;
    }
  }

  /** The day `before` → `day` as each waiting coach lives it: his news, turning points and board notes; and the first reason it must stop for one of them. */
  function tellWaitingCoaches(before: GameState, day: DayResult): StopReason | null {
    let stop: StopReason | null = null;
    waiting = waiting.map((parts, index) => {
      const from = swapSeat(before, index);
      const to = swapSeat(day.state, index);
      const events = eventsOfWaitingCoach(day.events, day.waitingEvents?.[index]);
      stop ??= stopReason(from, to, events);
      return {
        ...parts,
        news: [...parts.news, ...inboxLines(from, to, events)].slice(-INBOX_SIZE),
        desk: noted(parts.desk, from, { state: to, events }),
        turningPoints: [...parts.turningPoints, ...turningPointsOf(from, to, events)],
      };
    });
    return stop;
  }

  /** In a hot-seat game, only the last coach of the turn plays the day on, once everyone had his turn. */
  function refuseBeforeLastTurn(refusal: string) {
    if (waiting.length && seated !== waiting.length) throw new Error(`${refusal} before the last coach's turn`);
  }

  function hotSeatView(): HotSeatView | null {
    return hotSeatViewOf(current(), seated);
  }

  /**
   * The session's hot-seat, clock and scouting parts a save keeps; a one-coach game without the clock or
   * scouting adds none, so its saves stay as they were.
   */
  function seatsToSave() {
    return {
      ...(clock ? { clock } : {}),
      ...scoutingToSave(scouting),
      ...(waiting.length ? { seats: { waiting: waiting.map((parts) => ({ ...parts, news: [] })), seated, passed } } : {}),
    };
  }

  function clockView(): MarketClockView | null {
    const game = current();
    return marketClockView(clock, game, game.date, game.marketClockSeconds);
  }

  function addNews(lines: readonly InboxLine[]) {
    news = [...news, ...lines].slice(-INBOX_SIZE);
  }

  /** Whether a request for this player went with the match day under way. */
  function isInRound(playerId: string): boolean {
    return !!live?.day.decisions.requests?.some((request) => request.playerId === playerId);
  }

  /** Changes the requests the match day under way hands the board at the final whistle. */
  function changeRoundRequests(change: (requests: readonly CoachRequest[]) => CoachRequest[]) {
    if (!live) return;
    const { decisions } = live.day;
    live = { ...live, day: { ...live.day, decisions: { ...decisions, requests: change(decisions.requests ?? []) } } };
  }

  /**
   * The desk after a day: the board's notes added, and the pending requests dropped if the coach changed
   * club, since they were for the old board, or if their player left the game.
   */
  function noted(on: BoardDesk, before: GameState, day: { state: GameState; events: DayEvent[] }): BoardDesk {
    const notes = boardNotes(before, day.state, day.events);
    const kept = day.state.coachClubId === before.coachClubId ? withoutLeavers(on.pending, day.state) : [];
    const pending = kept.length === on.pending.length ? on.pending : kept;
    if (!notes.answers.length && !notes.forcedSales.length) return pending === on.pending ? on : { ...on, pending };
    return {
      pending,
      answers: [...on.answers, ...notes.answers].slice(-DESK_ANSWERS),
      forcedSales: [...on.forcedSales, ...notes.forcedSales].slice(-DESK_FORCED_SALES),
    };
  }

  const commands: { [T in CommandType]: (command: GameCommand<T>) => CommandResults[T] } = {
    newGame({ seed, choices }) {
      return begin(newGameFromFiles(seed, choices, files));
    },
    /** A save from before positions gets them from the shipped pack (withPackPositions), one from before AI coaches gets them from its seed, and one from before sponsors its clubs' kit deals. */
    load({ save }) {
      const loaded = readStoredSave(save);
      const positioned = withCoachWorld(withPackPositions(loaded.game, files));
      const game = positioned.sponsors || !files.sponsors ? positioned : seedGameSponsors(positioned, files.sponsors);
      const summary = begin(game);
      desk = loaded.desk;
      turningPoints = loaded.turningPoints;
      clock = loaded.clock ?? null;
      scouting = loaded.scouting ?? EMPTY_SCOUTING;
      if (loaded.seats) {
        waiting = loaded.seats.waiting;
        seated = loaded.seats.seated;
        passed = loaded.seats.passed;
      }
      live = loaded.live && { ...loaded.live, day: { ...loaded.live.day, state: game } };
      return summary;
    },
    /** If any day throws, the game stays where it was. */
    advance({ days }) {
      refuseBeforeLastTurn("the days can't be played");
      return keepingSeatsOnFailure(() => {
        let next = current();
        const events: DayEvent[] = [];
        const lines: InboxLine[] = [];
        const points: TurningPoint[] = [];
        let notes = desk;
        for (const decisions of days) {
          const { day } = playDay(next, decisions);
          lines.push(...inboxLines(next, day.state, day.events));
          points.push(...turningPointsOf(next, day.state, day.events));
          notes = noted(notes, next, day);
          next = day.state;
          events.push(...day.events);
        }
        state = next;
        desk = notes;
        live = null;
        if (days.length) lastRound = null;
        addNews(lines);
        turningPoints = [...turningPoints, ...points];
        if (days.length) startTurnOver();
        return { date: next.date, events };
      });
    },
    /**
     * The hub's "Jogar rodada": plays days with no decisions until the coach's next match day or
     * until something needs him, and starts the inbox over with what those days brought. On a match
     * day it plays nothing and the inbox stays. Each day hands the board the coach's requests that
     * are due. If any day throws, the game stays where it was. In a hot-seat game it stops at any
     * human coach's match day or anything one of them must see.
     */
    playToMatchDay() {
      refuseBeforeLastTurn("the days can't be played");
      return keepingSeatsOnFailure(() => {
        const points: TurningPoint[] = [];
        let notes = desk;
        const isHotSeat = waiting.length > 0;
        if (isHotSeat) waiting = waiting.map((parts) => ({ ...parts, news: [] }));
        const played = playToMatchDay(
          current(),
          (before) => {
            const { due, waiting: later } = dueRequests(before, notes.pending);
            const { day, stop } = playDay(before, due.length ? { requests: due } : {});
            points.push(...turningPointsOf(before, day.state, day.events));
            notes = noted({ ...notes, pending: later }, before, day);
            return { ...day, stop };
          },
          undefined,
          isHotSeat ? isHumanMatchDay : isCoachMatchDay,
        );
        state = played.state;
        desk = notes;
        turningPoints = [...turningPoints, ...points];
        if (played.daysPlayed > 0) {
          lastRound = null;
          news = played.news.slice(-INBOX_SIZE);
          startTurnOver();
        }
        return { date: played.state.date, stop: played.stop, daysPlayed: played.daysPlayed };
      });
    },
    /**
     * Kicks off the coach's match day. Every match is drawn now; the screen plays the timelines back.
     * The coach's requests that are due go with the day and reach the board after the final whistle.
     */
    startRound({ lineup, tactics }) {
      refuseBeforeLastTurn("the round can't start");
      const kickOff: DayDecisions = { lineup, tactics };
      const { due } = dueRequests(current(), desk.pending);
      const decisions = due.length ? { ...kickOff, requests: due } : kickOff;
      lastRound = null;
      live = { day: startMatchDay(current(), waiting.length ? { ...decisions, waiting: waitingDecisions(current()) } : decisions), seenMinute: 0 };
      return liveRoundOf(live.day, live.seenMinute);
    },
    /** The screen has shown the round up to `minute`; the coach can't change his match before it any more. */
    seeMinute({ minute }) {
      const round = underWay();
      round.seenMinute = Math.max(round.seenMinute, minute);
    },
    /** A coach's change at `minute` of his match; the rest of his match is drawn again. */
    changeLive({ minute, change, clubId }) {
      const round = underWay();
      if (minute < round.seenMinute) throw new Error(`a change can't come before minute ${round.seenMinute}`);
      live = { day: applyLiveChange(round.day, minute, change, clubId), seenMinute: minute };
      return liveRoundOf(live.day, live.seenMinute);
    },
    /** The final whistle: records the day and adds the coach's results to the inbox. */
    finishRound() {
      const round = underWay();
      const before = current();
      const day = finishMatchDay(round.day);
      const sent = new Set((round.day.decisions.requests ?? []).map((request) => request.playerId));
      state = day.state;
      lastRound = round.day;
      live = null;
      desk = noted({ ...desk, pending: desk.pending.filter((request) => !sent.has(request.playerId)) }, before, day);
      addNews(inboxLines(before, day.state, day.events));
      turningPoints = [...turningPoints, ...turningPointsOf(before, day.state, day.events)];
      if (waiting.length) {
        dropSentRequests(round.day.decisions.waiting);
        tellWaitingCoaches(before, day);
        startTurnOver();
      }
      return { date: day.state.date, events: day.events };
    },
    closeTurningPoint() {
      turningPoints = turningPoints.slice(1);
    },
    /**
     * The coach turns an open offer down; accepting one is a day's decision (`acceptOffer`). Refused
     * during a round, whose final whistle rebuilds the game from the kick-off copy and would undo it.
     */
    declineOffer({ clubId }) {
      state = declineOffer(betweenDays("an offer can't be declined"), clubId);
    },
    /** His requests were for the board he left, so they go with him. Refused during a round, like declining an offer. */
    resign() {
      state = resign(betweenDays("the coach can't resign"));
      desk = { ...desk, pending: [] };
    },
    applyForJob({ clubId }) {
      const applied = applyForJob(betweenDays("a job can't be applied for"), clubId);
      state = applied.state;
      return applied.answer;
    },
    /** Puts a request on the board's desk; it reaches the board on the next day played that it is due. */
    ask({ request }) {
      current();
      if (isSigning(request) && clockView()?.leftSeconds === 0) throw new Error("the market clock has run out for this window");
      desk = { ...desk, pending: withRequest(desk.pending, request) };
      if (isInRound(request.playerId)) changeRoundRequests((requests) => withRequest(requests, request));
      return desk;
    },
    /** Takes the pending request for this player off the desk. */
    withdraw({ playerId }) {
      desk = { ...desk, pending: desk.pending.filter((r) => r.playerId !== playerId) };
      if (isInRound(playerId)) changeRoundRequests((requests) => requests.filter((r) => r.playerId !== playerId));
      return desk;
    },
    listPlayer({ playerId, way }) {
      state = listPlayer(betweenDays("a player can't be listed"), playerId, way);
    },
    /** The coach's answer to a club's offer for one of his players; a sale it makes goes to the inbox. */
    answerBid({ playerId, answer }) {
      const before = betweenDays("an offer can't be answered");
      const answered = answerBid(before, playerId, answer);
      state = answered.state;
      addNews(inboxLines(before, answered.state, answered.events));
      return answered.outcome;
    },
    declineCounter({ playerId }) {
      state = declineCounter(betweenDays("a counter-offer can't be declined"), playerId);
    },
    priceTickets({ price }) {
      state = setTicketPrice(betweenDays("tickets can't be priced"), price);
    },
    askStadiumWorks({ seats }) {
      const asked = requestStadiumWorks(betweenDays("the board can't be asked for works"), seats);
      state = asked.state;
      return asked.answer;
    },
    takeBankLoan({ amount, months }) {
      const asked = takeBankLoan(betweenDays("the bank can't be asked for a loan"), amount, months);
      state = asked.state;
      return asked.answer;
    },
    repayBankLoan() {
      state = repayBankLoan(betweenDays("the bank loan can't be paid off"));
    },
    bookFriendly({ opponentId, date, isHome }) {
      const asked = bookFriendly(betweenDays("a friendly can't be booked"), opponentId, date, isHome);
      state = asked.state;
      return asked.answer;
    },
    promoteProspect({ prospectId }) {
      const moved = promoteProspect(betweenDays("a kid can't be promoted"), prospectId);
      state = moved.state;
      return { refusal: moved.refusal };
    },
    releaseProspect({ prospectId }) {
      const moved = releaseProspect(betweenDays("a kid can't be released"), prospectId);
      state = moved.state;
      return { refusal: moved.refusal };
    },
    sellProspect({ prospectId }) {
      const { state: sold, ...answer } = sellProspect(betweenDays("a kid can't be sold"), prospectId);
      state = sold;
      return answer;
    },
    passTurn({ lineup, tactics, acceptOffer }) {
      betweenDays("the turn can't pass");
      if (!waiting.length) throw new Error("a one-coach game has no turns to pass");
      if (seated === waiting.length) throw new Error("the last coach of the turn plays the day instead");
      passed[seated] = { lineup, tactics, acceptOffer };
      rotateSeat();
      const view = hotSeatView();
      if (!view) throw new Error("a hot-seat game lost its coaches");
      return view;
    },
    findEgg({ eggId }) {
      const before = current();
      const found = findCoachEgg(before, eggId);
      if (!found.event) return null;
      state = found.state;
      addNews(inboxLines(before, found.state, [found.event]));
      return found.event;
    },
    answerEvent({ choice }) {
      const before = betweenDays("an event can't be answered");
      if (!before.coachClubId) throw new Error("a coach without a club has no events to answer");
      const answered = answerEvent(before, before.coachClubId, choice);
      state = answered.state;
      addNews(inboxLines(before, answered.state, [answered.event]));
      return answered.event;
    },
    handToAssistant({ area, isHanded }) {
      const game = betweenDays("the assistant can't take an area");
      const areas = (game.coach.assistantAreas ?? []).filter((own) => own !== area);
      state = { ...game, coach: { ...game.coach, assistantAreas: isHanded ? [...areas, area] : areas } };
    },
    setAssistantDuty({ duty, isOn }) {
      const game = betweenDays("the assistant's duties can't change");
      state = duty === "ticketPrice" ? withAssistantPricing(game, isOn) : { ...game, coach: withAssistantDuty(game.coach, duty, isOn) };
    },
    hireAssistant({ candidateId }) {
      const hired = hireAssistant(betweenDays("an assistant can't be hired"), candidateId);
      state = hired.state;
      return { refusal: hired.refusal };
    },
    fireAssistant() {
      state = fireAssistant(betweenDays("the assistant can't be let go"));
    },
    nameCaptain({ playerId }) {
      const game = betweenDays("a captain can't be named");
      if (!game.coachClubId) throw new Error("a coach without a club names no captain");
      state = nameCaptain(game, game.coachClubId, playerId);
    },
    watchPlayer({ playerId, isWatched }) {
      scouting = watch(scouting, playerId, isWatched);
      return scouting;
    },
    saveFilter({ name, filters }) {
      scouting = keepFilter(scouting, name, filters);
      return scouting;
    },
    deleteFilter({ name }) {
      scouting = forgetFilter(scouting, name);
      return scouting;
    },
    signSponsor({ offerId }) {
      const game = betweenDays("a sponsor can't be signed");
      if (!game.coachClubId) throw new Error("a coach without a club signs no sponsor");
      if (game.coach.picksSponsors !== true) throw new Error("the board negotiates the sponsors; take them from it first");
      const offer = game.sponsors?.[game.coachClubId]?.offers.find((o) => o.id === offerId);
      state = signSponsorOffer(game, game.coachClubId, offerId);
      if (offer) addNews(inboxLines(game, state, [{ type: "sponsorSigned", clubId: game.coachClubId, slot: offer.slot, brandName: offer.brandName, yearly: offer.yearly, years: offer.years, byBoard: false }]));
      return sponsorsPageOf(state);
    },
    pickSponsors({ isPicking }) {
      const game = betweenDays("the sponsors can't change hands");
      const coach = { ...game.coach };
      if (isPicking) coach.picksSponsors = true;
      else delete coach.picksSponsors;
      state = { ...game, coach };
    },
    retirePlayer({ playerId }) {
      const before = betweenDays("a player can't be retired");
      const retired = retirePlayer(before, playerId);
      state = retired.state;
      desk = { ...desk, pending: withoutLeavers(desk.pending, retired.state) };
      addNews(inboxLines(before, retired.state, [retired.event]));
    },
    persuadeToStay({ playerId }) {
      const before = betweenDays("a player can't be asked to stay");
      const asked = persuadeToStay(before, playerId);
      state = asked.state;
      addNews(inboxLines(before, asked.state, [asked.event]));
      return asked.event;
    },
    spendMarketTime({ seconds, playerId }) {
      const game = current();
      const isOwnPlayer = playerId !== undefined && game.coachClubId !== null && game.players[playerId]?.clubId === game.coachClubId;
      if (!isOwnPlayer) clock = spendMarketTime(clock, game, game.date, game.marketClockSeconds, seconds);
      return clockView();
    },
  };

  return {
    apply<T extends CommandType>(command: GameCommand<T>): CommandResults[T] {
      // A command comes off a message; a type the session doesn't own must not reach Object's own methods.
      if (!Object.hasOwn(commands, command.type)) throw new Error(`unknown command: ${command.type}`);
      return commands[command.type](command);
    },
    /** The lineup sheet before kick-off on the coach's match day; with a formation, the assistant's eleven in it. */
    matchDayPlan(formation?: Formation): MatchDayPlan {
      return matchDayPlan(current(), formation);
    },
    /** The awards screen: the season under way so far, the filed seasons and the records. */
    awards(): AwardsBook {
      return awardsBook(current());
    },
    /** The coaches screen: the rankings as of `season` (the latest when left out), the job centre and the seated coach's own profile. */
    coaches(season?: number): CoachesPage {
      return coachesPage(current(), season);
    },
    /** A coach's page by his ranking key, or by a club's id for its AI coach; null when nobody has it. */
    coachProfile(key: string): CoachProfile | null {
      return coachProfile(current(), key);
    },
    /** The assistant's screen of the coach in the seat. */
    assistant(): AssistantPage {
      return assistantPage(current());
    },
    /** The chemistry screen of the seated coach's club; null without a club. */
    chemistry(): ChemistryPage | null {
      return chemistryPage(current());
    },
    /** The match day kicked off and not yet finished, if any. */
    liveRound(): LiveRound | null {
      return live && liveRoundOf(live.day, live.seenMinute);
    },
    /** The page of a match by its reference (a fixture id, or worldMatchRef for a league played result-only); null for one not played yet. */
    matchPage(ref: string): MatchPage | null {
      const day = live ? { day: live.day, isUnderWay: true } : lastRound ? { day: lastRound, isUnderWay: false } : null;
      return matchPageOf(current(), ref, day);
    },
    /** The oldest firing or season end the coach has not seen through yet. */
    turningPoint(): TurningPoint | null {
      return turningPoints[0] ?? null;
    },
    inbox(): InboxLine[] {
      return news;
    },
    desk(): BoardDesk {
      return desk;
    },
    /** The hot-seat coaches in turn order and who sits now; null in a one-coach game. */
    hotSeat(): HotSeatView | null {
      return hotSeatView();
    },
    /** The event waiting for the seated coach's answer, if any. */
    pendingEvent(): PendingEvent | null {
      const game = current();
      return pendingEventOf(game, game.coachClubId);
    },
    /** The easter eggs the career found, out of every egg in the game. */
    eggAlbum(): EggAlbum {
      return eggAlbumOf(current());
    },
    /** The round's newspaper of `date` as the seated coach reads it, the latest when left out; null before the first edition. */
    newspaper(date?: IsoDate): Edition | null {
      return newspaperOf(current(), date);
    },
    /** The newspaper's editions, newest first. */
    newspaperEditions(): EditionTitle[] {
      return newspaperEditions(current());
    },
    /** The watch list and saved market searches of the coach in the seat. */
    scouting(): Scouting {
      return scouting;
    },
    /** The sponsors screen of the seated coach's club; null without a club. */
    sponsors(): SponsorsPage | null {
      return sponsorsPageOf(current());
    },
    /** The odds the betting sponsor on the seated coach's kit posts for his next match; null without one. */
    betSticker(): BetSticker | null {
      return betStickerOf(current());
    },
    /** The seated coach's market clock for the window open today; null without the clock or a window. */
    marketClock(): MarketClockView | null {
      return clockView();
    },
    save(): string {
      return writeSessionSave({ game: current(), desk, turningPoints, live, ...seatsToSave() });
    },
    /** The save as shards: the game, each result-only country, and the rest of the session. */
    saveShards(): SaveShards {
      split = splitGame(current(), split);
      return writeSessionShards(split, { desk, turningPoints, live, ...seatsToSave() });
    },
    read<K extends keyof GameState>(keys: readonly K[]): Pick<GameState, K> {
      return pick(current(), keys);
    },
  };
}

export type EngineSession = ReturnType<typeof createEngineSession>;
