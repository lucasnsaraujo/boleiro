import { advanceDay, type DayDecisions, type DayEvent } from "../../src/sim/advanceDay.js";
import type { GameState, IsoDate } from "../../src/sim/gameState.js";
import { applyLiveChange, type LiveChange } from "../../src/sim/live/applyLiveChange.js";
import { finishMatchDay } from "../../src/sim/live/finishMatchDay.js";
import type { LiveDay } from "../../src/sim/live/liveDay.js";
import { startMatchDay } from "../../src/sim/live/startMatchDay.js";
import { newGameFromFiles, type GameFiles } from "../../src/sim/loadNewGame.js";
import type { NewGameOptions } from "../../src/sim/newGame.js";
import { loadGame, saveGame } from "../../src/sim/saveGame.js";
import type { CoachRequest } from "../../src/sim/transfers/coachRequest.js";
import { inboxLines, type InboxLine } from "../hub/inboxLines.js";
import { playToMatchDay, type StopReason } from "../hub/playToMatchDay.js";
import { boardNotes, dueRequests, EMPTY_DESK, withRequest, type BoardDesk } from "../market/boardDesk.js";
import { liveRoundOf, type LiveRound } from "../round/liveRoundOf.js";
import { matchDayPlan, type MatchDayPlan } from "../round/matchDayPlan.js";

export type NewGameChoices = Pick<NewGameOptions, "coachClubId" | "careerMode">;
export type GameSummary = Pick<GameState, "date" | "season" | "coachClubId">;
export type AdvanceResult = { date: IsoDate; events: DayEvent[] };
export type PlayResult = { date: IsoDate; stop: StopReason; daysPlayed: number };
/** The coach's eleven and tactics for kick-off; left out, the assistant's pick and his last tactics. */
export type KickOff = Pick<DayDecisions, "lineup" | "tactics">;

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

/** The game the worker holds. Everything that runs the sim goes through here, off the main thread. */
export function createEngineSession(files: GameFiles) {
  let state: GameState | null = null;
  /** What happened to the coach since he last played on, oldest first. */
  let news: InboxLine[] = [];
  /** The coach's requests waiting for the board, and what the board did, since the game was opened. */
  let desk: BoardDesk = EMPTY_DESK;
  /** The coach's match day between kick-off and the final whistle, and the furthest minute the screen has shown of it. */
  let live: { day: LiveDay; seenMinute: number } | null = null;

  function underWay() {
    if (!live) throw new Error("no match day is under way");
    return live;
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

  function noted(on: BoardDesk, before: GameState, day: { state: GameState; events: DayEvent[] }): BoardDesk {
    const notes = boardNotes(before, day.state, day.events);
    if (!notes.answers.length && !notes.forcedSales.length) return on;
    return {
      pending: on.pending,
      answers: [...on.answers, ...notes.answers].slice(-DESK_ANSWERS),
      forcedSales: [...on.forcedSales, ...notes.forcedSales].slice(-DESK_FORCED_SALES),
    };
  }

  return {
    newGame(seed: number, choices: NewGameChoices): GameSummary {
      return begin(newGameFromFiles(seed, choices, files));
    },
    /** Plays one day per entry. If any day throws, the game stays where it was. */
    advance(days: readonly DayDecisions[]): AdvanceResult {
      let next = current();
      const events: DayEvent[] = [];
      const lines: InboxLine[] = [];
      let notes = desk;
      for (const decisions of days) {
        const day = advanceDay(next, decisions);
        lines.push(...inboxLines(next, day.state, day.events));
        notes = noted(notes, next, day);
        next = day.state;
        events.push(...day.events);
      }
      state = next;
      desk = notes;
      live = null;
      addNews(lines);
      return { date: next.date, events };
    },
    /**
     * The hub's "Jogar rodada": plays days with no decisions until the coach's next match day or
     * until something needs him, and starts the inbox over with what those days brought. On a match
     * day it plays nothing and the inbox stays. Each day hands the board the coach's requests that
     * are due. If any day throws, the game stays where it was.
     */
    playToMatchDay(): PlayResult {
      let notes = desk;
      const played = playToMatchDay(current(), (before) => {
        const { due, waiting } = dueRequests(before, notes.pending);
        const day = advanceDay(before, due.length ? { requests: due } : {});
        notes = noted({ ...notes, pending: waiting }, before, day);
        return day;
      });
      state = played.state;
      desk = notes;
      if (played.daysPlayed > 0) news = played.news.slice(-INBOX_SIZE);
      return { date: played.state.date, stop: played.stop, daysPlayed: played.daysPlayed };
    },
    /** The lineup sheet before kick-off on the coach's match day. */
    matchDayPlan(): MatchDayPlan {
      return matchDayPlan(current());
    },
    /**
     * Kicks off the coach's match day. Every match is drawn now; the screen plays the timelines back.
     * The coach's requests that are due go with the day and reach the board after the final whistle.
     */
    startRound(kickOff: KickOff): LiveRound {
      const { due } = dueRequests(current(), desk.pending);
      live = { day: startMatchDay(current(), due.length ? { ...kickOff, requests: due } : kickOff), seenMinute: 0 };
      return liveRoundOf(live.day, live.seenMinute);
    },
    /** The match day kicked off and not yet finished, if any. */
    liveRound(): LiveRound | null {
      return live && liveRoundOf(live.day, live.seenMinute);
    },
    /** The screen has shown the round up to `minute`; the coach can't change his match before it any more. */
    seeMinute(minute: number): void {
      const round = underWay();
      round.seenMinute = Math.max(round.seenMinute, minute);
    },
    /** The coach's change at `minute` of his match; the rest of his match is drawn again. */
    changeLive(minute: number, change: LiveChange): LiveRound {
      const round = underWay();
      if (minute < round.seenMinute) throw new Error(`a change can't come before minute ${round.seenMinute}`);
      live = { day: applyLiveChange(round.day, minute, change), seenMinute: minute };
      return liveRoundOf(live.day, live.seenMinute);
    },
    /** The final whistle: records the day and adds the coach's results to the inbox. */
    finishRound(): AdvanceResult {
      const round = underWay();
      const before = current();
      const day = finishMatchDay(round.day);
      const sent = new Set((round.day.decisions.requests ?? []).map((request) => request.playerId));
      state = day.state;
      live = null;
      desk = noted({ ...desk, pending: desk.pending.filter((request) => !sent.has(request.playerId)) }, before, day);
      addNews(inboxLines(before, day.state, day.events));
      return { date: day.state.date, events: day.events };
    },
    inbox(): InboxLine[] {
      return news;
    },
    /** Puts a request on the board's desk; it reaches the board on the next day played that it is due. */
    ask(request: CoachRequest): BoardDesk {
      current();
      desk = { ...desk, pending: withRequest(desk.pending, request) };
      if (isInRound(request.playerId)) changeRoundRequests((requests) => withRequest(requests, request));
      return desk;
    },
    /** Takes the pending request for this player off the desk. */
    withdraw(playerId: string): BoardDesk {
      desk = { ...desk, pending: desk.pending.filter((r) => r.playerId !== playerId) };
      if (isInRound(playerId)) changeRoundRequests((requests) => requests.filter((r) => r.playerId !== playerId));
      return desk;
    },
    desk(): BoardDesk {
      return desk;
    },
    save(): string {
      return saveGame(current());
    },
    load(save: string): GameSummary {
      return begin(loadGame(save));
    },
    read<K extends keyof GameState>(keys: readonly K[]): Pick<GameState, K> {
      return pick(current(), keys);
    },
  };
}

export type EngineSession = ReturnType<typeof createEngineSession>;
