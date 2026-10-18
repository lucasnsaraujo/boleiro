import { loadPack, type DataPack } from "@boleiro/data/dataPack";
import { loadSponsorsPack, type SponsorsPack } from "@boleiro/data/sponsors";
import type { GameState } from "./gameState.js";
import { newGame, type CountryStart, type NewGameOptions } from "./newGame.js";
import type { Guests } from "./world/guests.js";
import type { NationalFootball } from "@boleiro/data/nationalFootball";

type DataOptions = keyof DataPack;

/** The decoded data pack (`packages/data/pack/`), as the browser bundles it or Node reads it, the world a new game plays around Brazil and its national football. */
export type GameFiles = DataPack & { world?: readonly CountryStart[]; guests?: Guests; sponsors?: SponsorsPack; nationalFootball?: NationalFootball };

export function loadNewGame(seed: number, options: Omit<NewGameOptions, DataOptions>): GameState {
  return newGame(seed, { ...options, ...loadPack(), sponsors: loadSponsorsPack() });
}

/** Same game as `loadNewGame`, from a pack the caller already has, as in a browser bundle. */
export function newGameFromFiles(seed: number, options: Omit<NewGameOptions, DataOptions>, files: GameFiles): GameState {
  return newGame(seed, { ...options, ...files });
}
