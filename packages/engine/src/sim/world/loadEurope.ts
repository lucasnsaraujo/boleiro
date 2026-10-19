import { loadWorldPack } from "@boleiro/data/worldPack";
import type { CountryStart } from "../newGame.js";
import { EUROPE, europeStart } from "./europe.js";

/** Europe's result-only countries from the shipped world packs, read in Node. */
export function loadEurope(season: number): CountryStart[] {
  return europeStart(EUROPE.map((structure) => loadWorldPack(structure.id)), season);
}
