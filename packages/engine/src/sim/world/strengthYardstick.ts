/**
 * Strength from a Transfermarkt market value, for leagues without Brazil's ratings: the
 * least-squares line of Brazil's ratings (pipeline/rate_players.py) on the log market value of the
 * same 1,160 players in the world scrape's Brazil pack, joined on club and name. It misses a
 * Brazilian rating by 3.2 points on average (root mean square). guess: a value buys the same
 * strength in every league, until S22's league-aware yardstick.
 */
export const YARDSTICK = { intercept: 15.04, slope: 3.861 };
const WEAKEST = 30;
const STRONGEST = 95;

export function strengthFromValue(valueEur: number): number {
  const strength = Math.round(YARDSTICK.intercept + YARDSTICK.slope * Math.log(Math.max(1, valueEur)));
  return Math.min(STRONGEST, Math.max(WEAKEST, strength));
}
