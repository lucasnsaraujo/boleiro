import type { SimPlayer, Tier } from "../gameState.js";

/** Where a player comes from: a Brazilian tier, or a club abroad. */
export type Origin = Tier | "abroad";
export type Move = {
  player: Pick<SimPlayer, "id" | "age" | "nationalities" | "wage">;
  from: Origin;
  to: { tier: Tier; fanbase: number };
  /** Monthly wage offered, BRL. */
  wage: number;
};

// No public data measures how willing players are to move, so every weight below is a guess,
// tuned so the cases in willingToJoin.test.ts read like the Brazilian market.
// guess: a move one rung up the ladder (state → D → C → B → A → abroad) is welcome, one down is not.
const RANK: Record<Origin, number> = { abroad: 5, A: 4, B: 3, C: 2, D: 1, state: 0 };
const BASE = 0.5; // guess: an even move at the same wage is a little more likely yes than no
const PER_RUNG = 1.4; // guess
// guess: doubling the wage is worth about one and a half rungs.
const PER_LOG_WAGE = 3;
// guess: a club ten times the median fanbase (80,000 in clubs.csv) is worth half a rung.
const MEDIAN_FANBASE = 80_000;
const PER_LOG10_FANBASE = 0.7;
// guess: from 30 a player cares half as much about stepping down.
const VETERAN_AGE = 30;
const VETERAN_DROP_DISCOUNT = 0.5;
// guess: a Brazilian abroad feels the pull of home; a European in his prime almost never comes.
const HOMECOMING = 2.5;
const EUROPEAN_IN_PRIME = -5;
// guess: a foreigner who would play outside Série A or B misses home more than the money is worth.
const FOREIGNER_IN_LOWER_DIVISION = -3;
// guess: ambition spreads ±1 rung of reluctance to step down across players, fixed per player.
const AMBITION_SPREAD = 1;
const SOUTH_AMERICA = new Set(["Argentina", "Uruguay", "Colombia", "Paraguay", "Ecuador", "Venezuela", "Chile", "Peru", "Bolivia"]);

/** A fixed 0–1 ambition per player, hashed from his id, so it needs no saved state. */
export function ambitionOf(playerId: string): number {
  let hash = 2166136261;
  for (const char of playerId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

export const isBrazilian = (nationalities: readonly string[]): boolean => nationalities.length === 0 || nationalities.includes("Brazil");

/** Chance the player agrees to join. */
export function willingToJoin({ player, from, to, wage }: Move): number {
  const veteran = player.age >= VETERAN_AGE;
  const ambition = (ambitionOf(player.id) - 0.5) * 2 * AMBITION_SPREAD;
  const rungs = RANK[to.tier] - RANK[from];
  const step = rungs >= 0 ? rungs * PER_RUNG : rungs * (PER_RUNG + ambition) * (veteran ? VETERAN_DROP_DISCOUNT : 1);
  const money = PER_LOG_WAGE * Math.log(Math.max(1, wage) / Math.max(1, player.wage));
  const fame = PER_LOG10_FANBASE * Math.log10(Math.max(1, to.fanbase) / MEDIAN_FANBASE);
  const brazilian = isBrazilian(player.nationalities);
  const european = !brazilian && !player.nationalities.some((n) => SOUTH_AMERICA.has(n));
  const home = from === "abroad" && brazilian ? HOMECOMING : 0;
  const prime = from === "abroad" && european && !veteran ? EUROPEAN_IN_PRIME : 0;
  const lower = !brazilian && to.tier !== "A" && to.tier !== "B" ? FOREIGNER_IN_LOWER_DIVISION : 0;
  return 1 / (1 + Math.exp(-(BASE + step + money + fame + home + prime + lower)));
}
