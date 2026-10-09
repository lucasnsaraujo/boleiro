import { loadClubs } from "../data/clubs.js";
import { loadCompetitionMoney } from "../data/competition-money.js";
import { loadFinances } from "../data/finances.js";
import { loadPlayers } from "../data/players.js";
import type { GameState } from "./gameState.js";
import { newGame, type NewGameOptions } from "./newGame.js";

type DataOptions = "clubs" | "players" | "finances" | "competitionMoney";

export function loadNewGame(seed: number, options: Omit<NewGameOptions, DataOptions>): GameState {
  return newGame(seed, {
    ...options,
    clubs: loadClubs(),
    players: loadPlayers(),
    finances: loadFinances(),
    competitionMoney: loadCompetitionMoney(),
  });
}
