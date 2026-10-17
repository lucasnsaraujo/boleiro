import { daysBetween } from "../dates.js";
import type { IsoDate, SimPlayer, Tier } from "../gameState.js";

// Least squares of log Transfermarkt value on strength over the 1,170 players with both a value and
// an age in data/players.csv: value ≈ €1.26M at strength 70, ×1.20 per strength point. It lands on
// the Série A (€1.8M at 72) and Série B (€325k at 63) medians of the same file.
const VALUE_AT_70_EUR = 1_260_000;
const GROWTH_PER_STRENGTH_POINT = 1.2;
// Same data, age terms of a fit with strength and division: ×1.07 a year younger than 27, ×0.947 a year older.
const PEAK_VALUE_AGE = 27;
const PER_YEAR_YOUNGER = 1.07;
const PER_YEAR_OLDER = 0.947;
// guess: a lower-division club is a weaker seller and its players are less seen, so they fetch less.
const DIVISION_FACTOR: Record<Tier, number> = { A: 1, B: 0.9, C: 0.8, D: 0.7, state: 0.6 };
// guess: a contract with two years or more left keeps full value; it falls in a straight line to 30%
// at expiry, when the player can leave for free.
const FULL_VALUE_MONTHS = 24;
const VALUE_AT_EXPIRY = 0.3;

/** His value in EUR at a Série A club before his contract and division count. */
function valueOfPlayerAlone(player: Pick<SimPlayer, "strength" | "age">): number {
  const strength = VALUE_AT_70_EUR * GROWTH_PER_STRENGTH_POINT ** (player.strength - 70);
  const age = player.age <= PEAK_VALUE_AGE ? PER_YEAR_YOUNGER ** (PEAK_VALUE_AGE - player.age) : PER_YEAR_OLDER ** (player.age - PEAK_VALUE_AGE);
  return strength * age;
}

/** Market value in EUR of a player at a club of `tier` with two years or more left on his contract. */
export const valueOnFullContract = (player: Pick<SimPlayer, "strength" | "age">, tier: Tier): number => Math.round(valueOfPlayerAlone(player) * DIVISION_FACTOR[tier]);

/** Market value in EUR of a player at a club of `tier` on `date`. */
export function valuePlayer(player: Pick<SimPlayer, "strength" | "age" | "contractUntil">, tier: Tier, date: IsoDate): number {
  const monthsLeft = Math.max(0, daysBetween(date, player.contractUntil) / 30.4);
  const contract = VALUE_AT_EXPIRY + (1 - VALUE_AT_EXPIRY) * Math.min(1, monthsLeft / FULL_VALUE_MONTHS);
  return Math.round(valueOfPlayerAlone(player) * contract * DIVISION_FACTOR[tier]);
}
