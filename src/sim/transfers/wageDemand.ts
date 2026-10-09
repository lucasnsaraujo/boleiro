import type { SimPlayer } from "../gameState.js";

// The opening wages' own rule (openingFinances.ts, guess): wages rise about 10% per strength point.
const WAGE_GROWTH_PER_STRENGTH_POINT = 0.1;
// guess: a player changing clubs wants a fifth more than he earns.
const MOVE_RAISE = 1.2;

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0;

/** What the club pays a player of this strength: its median wage, scaled by strength like the opening wages. */
export function goingRate(strength: number, squad: readonly Pick<SimPlayer, "wage" | "strength">[]): number {
  if (!squad.length) return 0;
  const gap = strength - median(squad.map((p) => p.strength));
  return Math.round(median(squad.map((p) => p.wage)) * Math.exp(WAGE_GROWTH_PER_STRENGTH_POINT * gap));
}

/** Monthly wage in BRL a player asks to join a club with this squad. */
export function wageDemand(player: Pick<SimPlayer, "wage" | "strength">, squad: readonly Pick<SimPlayer, "wage" | "strength">[]): number {
  return Math.max(1, Math.round(Math.max(player.wage * MOVE_RAISE, goingRate(player.strength, squad))));
}
