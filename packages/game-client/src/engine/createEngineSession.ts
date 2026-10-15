import type { Formation } from "@boleiro/engine/engine/formations";
import { advanceDay, type DayDecisions, type DayEvent, type DayResult, type WaitingDecisions } from "@boleiro/engine/sim/advanceDay";
import { declineOffer } from "@boleiro/engine/sim/coach/declineOffer";
import { passTheSeat, swapSeat, waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { applyLiveChange, type LiveChange } from "@boleiro/engine/sim/live/applyLiveChange";
import { finishMatchDay } from "@boleiro/engine/sim/live/finishMatchDay";
import type { LiveDay } from "@boleiro/engine/sim/live/liveDay";
import { startMatchDay } from "@boleiro/engine/sim/live/startMatchDay";
import { withPackPositions } from "@boleiro/engine/sim/players/withPackPositions";
import { newGameFromFiles, type GameFiles } from "@boleiro/engine/sim/loadNewGame";
import type { NewGameOptions } from "@boleiro/engine/sim/newGame";
import { answerBid, type BidAnswer, type BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { declineCounter } from "@boleiro/engine/sim/transfers/coachMarket";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { listPlayer, type SaleWay } from "@boleiro/engine/sim/transfers/listPlayer";
import { setTicketPrice } from "@boleiro/engine/sim/finances/setTicketPrice";
import { repayBankLoan, takeBankLoan, type BankLoanAnswer } from "@boleiro/engine/sim/finances/bankLoan";
import { bookFriendly, type FriendlyAnswer } from "@boleiro/engine/sim/friendlies/friendlies";
import { requestStadiumWorks, type WorksAnswer } from "@boleiro/engine/sim/stadium/stadiumWorks";
import { eventsOfWaitingCoach, hotSeatViewOf, isHumanMatchDay, type HotSeatView } from "../hub/hotSeat.js";
import { inboxLines, type InboxLine } from "../hub/inboxLines.js";
import { isCoachMatchDay, playToMatchDay, stopReason, type StopReason } from "../hub/playToMatchDay.js";
import { turningPointsOf, type TurningPoint } from "../hub/turningPoints.js";
import { boardNotes, dueRequests, EMPTY_DESK, withRequest, type BoardDesk } from "../market/boardDesk.js";
import { isSigning, marketClockView, spendMarketTime, type MarketClock, type MarketClockView } from "../market/marketClock.js";
import { liveRoundOf, type LiveRound } from "../round/liveRoundOf.js";
import { matchDayPlan, type MatchDayPlan } from "../round/matchDayPlan.js";
import { readStoredSave, splitGame, writeSessionSave, writeSessionShards, type SaveShards, type SeatParts, type SplitGame, type StoredSave } from "./sessionSave.js";

export type NewGameChoices = Pick<NewGameOptions, "coachClubId" | "careerMode" | "stateChampionships" | "midSeasonWindow" | "hotSeat" | "marketClockSeconds">;
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
  changeLive: { minute: number; change: LiveChange };
  finishRound: Record<never, never>;
  closeTurningPoint: Record<never, never>;
  declineOffer: { clubId: string };
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
};

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
  passTurn: HotSeatView;
  spendMarketTime: MarketClockView | null;
};

// guess: a season's busiest stretch gives the coach a few dozen lines; older ones are no longer news.
const INBOX_SIZE = 40;
// guess: the market and finances screens show a handful of the board's latest answers and sales.
const DESK_ANSWERS = 20;
const DESK_FORCED_SALES = 10;

function summaryOf({ date, season, coachClubId }: GameState): GameSummary {
  return { date, season, coachClubId };
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
  /** Firings and season ends the coach has not closed the screen on yet, oldest first; saved with the game. */
  let turningPoints: TurningPoint[] = [];
  /** The game as last saved in shards, whose unchanged countries the next save reuses. */
  let split: SplitGame | null = null;
  /** The time the coach in the seat spent on the market screens this window; saved with the game. */
  let clock: MarketClock | null = null;
  /** Each waiting hot-seat coach's inbox, desk, turning points and clock, in the game's waiting order; none in a one-coach game. */
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
    turningPoints = [];
    split = null;
    clock = null;
    waiting = waitingCoachesOf(next).map(() => ({ news: [], desk: EMPTY_DESK, turningPoints: [], clock: null }));
    seated = 0;
    passed = [];
    return summaryOf(next);
  }

  /** Hands the seat to the next coach in turn order; the one who sat goes to the back of the line with his part of the session. */
  function rotateSeat() {
    const [next, ...rest] = waiting;
    if (!next) return;
    waiting = [...rest, { news, desk, turningPoints, clock }];
    ({ news, desk, turningPoints, clock } = next);
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

  /** The session's hot-seat and clock parts a save keeps; a one-coach game without the clock adds none, so its saves stay as they were. */
  function seatsToSave() {
    return {
      ...(clock ? { clock } : {}),
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

  /** The desk after a day: the board's notes added, and the pending requests dropped if the coach changed club, since they were for the old board. */
  function noted(on: BoardDesk, before: GameState, day: { state: GameState; events: DayEvent[] }): BoardDesk {
    const notes = boardNotes(before, day.state, day.events);
    const pending = day.state.coachClubId === before.coachClubId ? on.pending : [];
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
    /** A save from before positions gets them from the shipped pack (withPackPositions). */
    load({ save }) {
      const loaded = readStoredSave(save);
      const game = withPackPositions(loaded.game, files);
      const summary = begin(game);
      desk = loaded.desk;
      turningPoints = loaded.turningPoints;
      clock = loaded.clock ?? null;
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
      live = { day: startMatchDay(current(), waiting.length ? { ...decisions, waiting: waitingDecisions(current()) } : decisions), seenMinute: 0 };
      return liveRoundOf(live.day, live.seenMinute);
    },
    /** The screen has shown the round up to `minute`; the coach can't change his match before it any more. */
    seeMinute({ minute }) {
      const round = underWay();
      round.seenMinute = Math.max(round.seenMinute, minute);
    },
    /** The coach's change at `minute` of his match; the rest of his match is drawn again. */
    changeLive({ minute, change }) {
      const round = underWay();
      if (minute < round.seenMinute) throw new Error(`a change can't come before minute ${round.seenMinute}`);
      live = { day: applyLiveChange(round.day, minute, change), seenMinute: minute };
      return liveRoundOf(live.day, live.seenMinute);
    },
    /** The final whistle: records the day and adds the coach's results to the inbox. */
    finishRound() {
      const round = underWay();
      const before = current();
      const day = finishMatchDay(round.day);
      const sent = new Set((round.day.decisions.requests ?? []).map((request) => request.playerId));
      state = day.state;
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
    /** The match day kicked off and not yet finished, if any. */
    liveRound(): LiveRound | null {
      return live && liveRoundOf(live.day, live.seenMinute);
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
