import { pickLineup, type PositionGroup } from "../../engine/match.js";
import type { SimPlayer, Tier } from "../gameState.js";

// Average 2026 squad per club by tier in data/players.csv: Série A 672 players / 20 clubs, B 651 / 20,
// C 638 / 20, D 2,279 / 96, state-only 2,524 / 125. AI clubs renew and sign to keep this size.
export const SQUAD_TARGET: Record<Tier, number> = { A: 33, B: 32, C: 31, D: 23, state: 20 };
// guess: a replacement is near the club's level: from 4 below to 2 above the average of its best eleven.
export const REPLACEMENT_BAND = { below: 4, above: 2 };
// guess: share of each position group in a squad (3 keepers in 24), as developPlayers tops squads up.
const SHAPE: Record<PositionGroup, number> = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

export type SquadNeeds = {
  /** Average strength of the best eleven. */
  level: number;
  /** The best eleven's weakest player, the one an upgrade replaces. */
  weakest: SimPlayer | null;
  /** The position group with the fewest players for its share of a squad. */
  thinnest: PositionGroup;
  /** Players short of the tier's usual squad size. */
  short: number;
};

export function squadNeeds(squad: readonly SimPlayer[], tier: Tier): SquadNeeds {
  const lineup = pickLineup([...squad]);
  const level = lineup.reduce((sum, p) => sum + p.strength, 0) / Math.max(1, lineup.length);
  const weakest = lineup.reduce<SimPlayer | null>((a, b) => (a === null || b.strength < a.strength ? b : a), null);
  const count = (g: PositionGroup) => squad.filter((p) => p.group === g).length / SHAPE[g];
  const thinnest = GROUPS.reduce((a, b) => (count(b) < count(a) ? b : a));
  return { level, weakest, thinnest, short: Math.max(0, SQUAD_TARGET[tier] - squad.length) };
}
