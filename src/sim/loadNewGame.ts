import { loadClubs } from "../data/clubs.js";
import { loadPlayers } from "../data/players.js";
import type { GameState } from "./gameState.js";
import { newGame, type NewGameOptions } from "./newGame.js";

export function loadNewGame(seed: number, options: Omit<NewGameOptions, "clubs" | "players">): GameState {
  return newGame(seed, { ...options, clubs: loadClubs(), players: loadPlayers() });
}
