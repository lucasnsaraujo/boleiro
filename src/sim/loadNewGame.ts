import { loadClubs, parseClubs } from "../data/clubs.js";
import { loadCompetitionMoney, parseCompetitionMoney } from "../data/competition-money.js";
import { loadFinances, parseFinances } from "../data/finances.js";
import { loadPlayers, parsePlayers } from "../data/players.js";
import type { GameState } from "./gameState.js";
import { newGame, type NewGameOptions } from "./newGame.js";

type DataOptions = "clubs" | "players" | "finances" | "competitionMoney";

/** The text of `data/clubs.csv`, `players.csv`, `finances.csv` and `competition-money.json`. */
export type GameFiles = { clubs: string; players: string; finances: string; competitionMoney: string };

export function loadNewGame(seed: number, options: Omit<NewGameOptions, DataOptions>): GameState {
  return newGame(seed, {
    ...options,
    clubs: loadClubs(),
    players: loadPlayers(),
    finances: loadFinances(),
    competitionMoney: loadCompetitionMoney(),
  });
}

/** Same game as `loadNewGame`, from file contents the caller already has, as in a browser bundle. */
export function newGameFromFiles(seed: number, options: Omit<NewGameOptions, DataOptions>, files: GameFiles): GameState {
  return newGame(seed, {
    ...options,
    clubs: parseClubs(files.clubs),
    players: parsePlayers(files.players),
    finances: parseFinances(files.finances),
    competitionMoney: parseCompetitionMoney(files.competitionMoney),
  });
}
