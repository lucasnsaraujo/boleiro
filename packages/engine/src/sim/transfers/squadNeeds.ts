import { pickLineup, type PositionGroup } from "../../engine/match.js";
import type { SimPlayer, Tier } from "../gameState.js";
import { SQUAD_SHAPE } from "../players/developPlayers.js";

// Average 2026 squad per club by tier in data/players.csv: Série A 672 players / 20 clubs, B 651 / 20,
// C 638 / 20, D 2,279 / 96, state-only 2,524 / 125. AI clubs renew and sign to keep this size.
export const SQUAD_TARGET: Record<Tier, number> = { A: 33, B: 32, C: 31, D: 23, state: 20 };
// guess: a replacement is a squad player near the middle of the squad, from 4 below to 2 above its
// median player, not only one good enough for its best eleven.
export const REPLACEMENT_BAND = { below: 4, above: 2 };
const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

export type SquadNeeds = {
  /** Average strength of the best eleven. */
  level: number;
  /** The squad's median strength, the level its replacements are signed around (REPLACEMENT_BAND). */
  middle: number;
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
  const strengths = squad.map((p) => p.strength).sort((a, b) => a - b);
  const middle = strengths[strengths.length >> 1] ?? level;
  const weakest = lineup.reduce<SimPlayer | null>((a, b) => (a === null || b.strength < a.strength ? b : a), null);
  const count = (g: PositionGroup) => squad.filter((p) => p.group === g).length / SQUAD_SHAPE[g];
  const thinnest = GROUPS.reduce((a, b) => (count(b) < count(a) ? b : a));
  return { level, middle, weakest, thinnest, short: Math.max(0, SQUAD_TARGET[tier] - squad.length) };
}
