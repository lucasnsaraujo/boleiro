import type { CupFinal } from "./continentalPlaces.js";

/** How many clubs a country sends to each of UEFA's league phases. */
export type UefaAllocation = { championsLeague: number; europaLeague: number };

export const UEFA_CUPS = ["champions-league", "europa-league"] as const;
export type UefaCup = (typeof UEFA_CUPS)[number];

/**
 * Next season's UEFA entrants of one country: the Champions League places down its top table, then
 * the Europa League's, the first of them to its cup winner unless he is in the Champions League.
 */
export function uefaPlaces(allocation: UefaAllocation, table: readonly string[], cup: CupFinal | null): Record<UefaCup, string[]> {
  const championsLeague = table.slice(0, allocation.championsLeague);
  const cupWinner = cup && allocation.europaLeague > 0 && !championsLeague.includes(cup.championId) ? [cup.championId] : [];
  const rest = table.filter((id) => !championsLeague.includes(id) && !cupWinner.includes(id));
  return { "champions-league": championsLeague, "europa-league": [...cupWinner, ...rest].slice(0, allocation.europaLeague) };
}
