import { advanceDay, type DayDecisions, type DayEvent } from "@boleiro/engine/sim/advanceDay";
import { declineOffer } from "@boleiro/engine/sim/coach/declineOffer";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import { applyLiveChange, type LiveChange } from "@boleiro/engine/sim/live/applyLiveChange";
import { finishMatchDay } from "@boleiro/engine/sim/live/finishMatchDay";
import type { LiveDay } from "@boleiro/engine/sim/live/liveDay";
import { startMatchDay } from "@boleiro/engine/sim/live/startMatchDay";
import { newGameFromFiles, type GameFiles } from "@boleiro/engine/sim/loadNewGame";
import type { NewGameOptions } from "@boleiro/engine/sim/newGame";
import { answerBid, type BidAnswer, type BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import { declineCounter } from "@boleiro/engine/sim/transfers/coachMarket";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { listPlayer, type SaleWay } from "@boleiro/engine/sim/transfers/listPlayer";
import { inboxLines, type InboxLine } from "../hub/inboxLines.js";
import { playToMatchDay, type StopReason } from "../hub/playToMatchDay.js";
import { turningPointsOf, type TurningPoint } from "../hub/turningPoints.js";
import { boardNotes, dueRequests, EMPTY_DESK, withRequest, type BoardDesk } from "../market/boardDesk.js";
import { liveRoundOf, type LiveRound } from "../round/liveRoundOf.js";
import { matchDayPlan, type MatchDayPlan } from "../round/matchDayPlan.js";
import { readStoredSave, splitGame, writeSessionSave, writeSessionShards, type SaveShards, type SplitGame, type StoredSave } from "./sessionSave.js";

export type NewGameChoices = Pick<NewGameOptions, "coachClubId" | "careerMode">;
export type GameSummary = Pick<GameState, "date" | "season" | "coachClubId">;
export type AdvanceResult = { date: IsoDate; events: DayEvent[] };
export type PlayResult = { date: IsoDate; stop: StopReason; daysPlayed: number };
/** The coach's eleven and tactics for kick-off; left out, the assistant's pick and his last tactics. */
export type KickOff = Pick<DayDecisions, "lineup" | "tactics">;

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
    return summaryOf(next);
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
    load({ save }) {
      const loaded = readStoredSave(save);
      const summary = begin(loaded.game);
      desk = loaded.desk;
      turningPoints = loaded.turningPoints;
      live = loaded.live;
      return summary;
    },
    /** If any day throws, the game stays where it was. */
    advance({ days }) {
      let next = current();
      const events: DayEvent[] = [];
      const lines: InboxLine[] = [];
      const points: TurningPoint[] = [];
      let notes = desk;
      for (const decisions of days) {
        const day = advanceDay(next, decisions);
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
      return { date: next.date, events };
    },
    /**
     * The hub's "Jogar rodada": plays days with no decisions until the coach's next match day or
     * until something needs him, and starts the inbox over with what those days brought. On a match
     * day it plays nothing and the inbox stays. Each day hands the board the coach's requests that
     * are due. If any day throws, the game stays where it was.
     */
    playToMatchDay() {
      const points: TurningPoint[] = [];
      let notes = desk;
      const played = playToMatchDay(current(), (before) => {
        const { due, waiting } = dueRequests(before, notes.pending);
        const day = advanceDay(before, due.length ? { requests: due } : {});
        points.push(...turningPointsOf(before, day.state, day.events));
        notes = noted({ ...notes, pending: waiting }, before, day);
        return day;
      });
      state = played.state;
      desk = notes;
      turningPoints = [...turningPoints, ...points];
      if (played.daysPlayed > 0) news = played.news.slice(-INBOX_SIZE);
      return { date: played.state.date, stop: played.stop, daysPlayed: played.daysPlayed };
    },
    /**
     * Kicks off the coach's match day. Every match is drawn now; the screen plays the timelines back.
     * The coach's requests that are due go with the day and reach the board after the final whistle.
     */
    startRound({ lineup, tactics }) {
      const kickOff: KickOff = { lineup, tactics };
      const { due } = dueRequests(current(), desk.pending);
      live = { day: startMatchDay(current(), due.length ? { ...kickOff, requests: due } : kickOff), seenMinute: 0 };
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
  };

  return {
    apply<T extends CommandType>(command: GameCommand<T>): CommandResults[T] {
      // A command comes off a message; a type the session doesn't own must not reach Object's own methods.
      if (!Object.hasOwn(commands, command.type)) throw new Error(`unknown command: ${command.type}`);
      return commands[command.type](command);
    },
    /** The lineup sheet before kick-off on the coach's match day. */
    matchDayPlan(): MatchDayPlan {
      return matchDayPlan(current());
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
    save(): string {
      return writeSessionSave({ game: current(), desk, turningPoints, live });
    },
    /** The save as shards: the game, each result-only country, and the rest of the session. */
    saveShards(): SaveShards {
      split = splitGame(current(), split);
      return writeSessionShards(split, { desk, turningPoints, live });
    },
    read<K extends keyof GameState>(keys: readonly K[]): Pick<GameState, K> {
      return pick(current(), keys);
    },
  };
}

export type EngineSession = ReturnType<typeof createEngineSession>;
