import { advanceDay, type DayDecisions, type DayEvent } from "../../src/sim/advanceDay.js";
import type { GameState, IsoDate } from "../../src/sim/gameState.js";
import { newGameFromFiles, type GameFiles } from "../../src/sim/loadNewGame.js";
import type { NewGameOptions } from "../../src/sim/newGame.js";
import { loadGame, saveGame } from "../../src/sim/saveGame.js";
import { inboxLines, type InboxLine } from "../hub/inboxLines.js";
import { playToMatchDay, type StopReason } from "../hub/playToMatchDay.js";

export type NewGameChoices = Pick<NewGameOptions, "coachClubId" | "careerMode">;
export type GameSummary = Pick<GameState, "date" | "season" | "coachClubId">;
export type AdvanceResult = { date: IsoDate; events: DayEvent[] };
export type PlayResult = { date: IsoDate; stop: StopReason; matchesPlayed: number };

// guess: a season's busiest stretch gives the coach a few dozen lines; older ones are no longer news.
const INBOX_SIZE = 40;

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

  function current(): GameState {
    if (!state) throw new Error("no game is loaded");
    return state;
  }

  function begin(next: GameState): GameSummary {
    state = next;
    news = [];
    return summaryOf(next);
  }

  function addNews(lines: readonly InboxLine[]) {
    news = [...news, ...lines].slice(-INBOX_SIZE);
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
      for (const decisions of days) {
        const day = advanceDay(next, decisions);
        lines.push(...inboxLines(next, day.state, day.events));
        next = day.state;
        events.push(...day.events);
      }
      state = next;
      addNews(lines);
      return { date: next.date, events };
    },
    /**
     * The hub's "Jogar rodada": empties the inbox, then plays days with no decisions until the
     * coach's next match day or until something needs him. If any day throws, the game stays where it was.
     */
    playToMatchDay(): PlayResult {
      const played = playToMatchDay(current(), (day) => advanceDay(day, {}));
      state = played.state;
      news = [];
      addNews(played.news);
      return { date: played.state.date, stop: played.stop, matchesPlayed: played.matchesPlayed };
    },
    inbox(): InboxLine[] {
      return news;
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
