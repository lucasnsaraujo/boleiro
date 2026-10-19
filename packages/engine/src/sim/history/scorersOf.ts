import type { PositionGroup } from "../../engine/match.js";
import type { SimPlayer } from "../gameState.js";
import { pow } from "../portableMath.js";

// guess: forwards score about 55% of goals, midfielders 30%, defenders 14% and keepers almost none, as is
// typical in top leagues; per player in a 4-4-2 that is roughly these weights. Not checked against Brazilian data.
const GROUP_WEIGHT: Record<PositionGroup, number> = { ATT: 27, MID: 7.5, DEF: 3.5, GK: 0.05 };
// guess: within a position, a player's share grows with the square of his strength, so stars score more.
const STRENGTH_POWER = 2;

/** Picks who scored each of a side's goals from its lineup. Returns one player id per goal. */
export function scorersOf(lineup: readonly SimPlayer[], goals: number, random: () => number): string[] {
  const weights = lineup.map((p) => GROUP_WEIGHT[p.group] * pow(p.strength / 50, STRENGTH_POWER));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!lineup.length || total <= 0) return [];
  return Array.from({ length: goals }, () => {
    let pick = random() * total;
    const index = weights.findIndex((w) => (pick -= w) < 0);
    return (lineup[index] ?? lineup[lineup.length - 1])?.id ?? "";
  });
}
