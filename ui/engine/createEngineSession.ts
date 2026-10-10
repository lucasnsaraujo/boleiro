import { advanceDay, type DayDecisions, type DayEvent } from "../../src/sim/advanceDay.js";
import type { GameState, IsoDate } from "../../src/sim/gameState.js";
import { newGameFromFiles, type GameFiles } from "../../src/sim/loadNewGame.js";
import type { NewGameOptions } from "../../src/sim/newGame.js";
import { loadGame, saveGame } from "../../src/sim/saveGame.js";

export type NewGameChoices = Pick<NewGameOptions, "coachClubId" | "careerMode">;
export type GameSummary = Pick<GameState, "date" | "season" | "coachClubId">;
export type AdvanceResult = { date: IsoDate; events: DayEvent[] };

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

  function current(): GameState {
    if (!state) throw new Error("no game is loaded");
    return state;
  }

  return {
    newGame(seed: number, choices: NewGameChoices): GameSummary {
      state = newGameFromFiles(seed, choices, files);
      return summaryOf(state);
    },
    /** Plays one day per entry. If any day throws, the game stays where it was. */
    advance(days: readonly DayDecisions[]): AdvanceResult {
      let next = current();
      const events: DayEvent[] = [];
      for (const decisions of days) {
        const day = advanceDay(next, decisions);
        next = day.state;
        events.push(...day.events);
      }
      state = next;
      return { date: next.date, events };
    },
    save(): string {
      return saveGame(current());
    },
    load(save: string): GameSummary {
      state = loadGame(save);
      return summaryOf(state);
    },
    read<K extends keyof GameState>(keys: readonly K[]): Pick<GameState, K> {
      return pick(current(), keys);
    },
  };
}

export type EngineSession = ReturnType<typeof createEngineSession>;
