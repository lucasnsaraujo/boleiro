import { loadPack, type DataPack } from "@boleiro/data/dataPack";
import type { GameState } from "./gameState.js";
import { newGame, type NewGameOptions } from "./newGame.js";

type DataOptions = keyof DataPack;

/** The decoded data pack (`packages/data/pack/`), as the browser bundles it or Node reads it. */
export type GameFiles = DataPack;

export function loadNewGame(seed: number, options: Omit<NewGameOptions, DataOptions>): GameState {
  return newGame(seed, { ...options, ...loadPack() });
}

/** Same game as `loadNewGame`, from a pack the caller already has, as in a browser bundle. */
export function newGameFromFiles(seed: number, options: Omit<NewGameOptions, DataOptions>, files: GameFiles): GameState {
  return newGame(seed, { ...options, ...files });
}
