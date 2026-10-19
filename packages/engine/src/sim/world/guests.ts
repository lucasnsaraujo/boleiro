import type { WorldPack } from "@boleiro/data/worldPack";
import { worldClubsOf } from "./countriesStart.js";
import type { WorldClub } from "./world.js";

/** The Club World Cup's clubs from countries without a league in the game, by country: squads only. */
export type Guests = Record<string, WorldClub[]>;

/** The 2025 Club World Cup's countries without a league in the game (pipeline/tm_world.py's GUEST_COUNTRIES). */
export const GUEST_COUNTRIES = ["ae", "eg", "jp", "kr", "ma", "nz", "tn", "za"] as const;

/** Each guest country's clubs with their packs' squads. */
export function guestsStart(packs: readonly WorldPack[], season: number): Guests {
  return Object.fromEntries(
    GUEST_COUNTRIES.map((id) => {
      const pack = packs.find((p) => p.country.id === id);
      if (!pack) throw new Error(`no world pack for ${id}`);
      return [id, worldClubsOf(pack, pack.clubs, season)];
    }),
  );
}
