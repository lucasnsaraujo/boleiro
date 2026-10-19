import { loadWorldPack } from "@boleiro/data/worldPack";
import type { CountryStart } from "../newGame.js";
import { SOUTH_AMERICA, southAmericaStart } from "./southAmerica.js";

/** South America's result-only countries from the shipped world packs, read in Node. */
export function loadSouthAmerica(season: number): CountryStart[] {
  return southAmericaStart(SOUTH_AMERICA.map((structure) => loadWorldPack(structure.id)), season);
}
