import type { IsoDate, Tier } from "../gameState.js";

// guess: contracts run to 31 December. Série A and B squads hold one to four years, evenly spread;
// lower-division clubs sign for a season or two, many only for the state championship and the year.
const YEARS_LEFT: Record<Tier, number> = { A: 4, B: 4, C: 2, D: 2, state: 1 };

/** The last day of the contract a player has when a new game starts in `season`. */
export function openingContractUntil(tier: Tier, season: number, random: () => number): IsoDate {
  return `${season + Math.floor(random() * YEARS_LEFT[tier])}-12-31`;
}
