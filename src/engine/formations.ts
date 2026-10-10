import { FORMATION, type Player, type PositionGroup } from "./match.js";

/** Players per position in each formation the coach can pick. */
export const FORMATIONS = {
  "4-4-2": FORMATION,
  "4-3-3": { GK: 1, DEF: 4, MID: 3, ATT: 3 },
  "4-5-1": { GK: 1, DEF: 4, MID: 5, ATT: 1 },
  "3-5-2": { GK: 1, DEF: 3, MID: 5, ATT: 2 },
  "5-3-2": { GK: 1, DEF: 5, MID: 3, ATT: 2 },
} as const satisfies Record<string, Record<PositionGroup, number>>;

export type Formation = keyof typeof FORMATIONS;

const GROUPS: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];

/**
 * The eleven with each player's slot in the formation: the strongest of each group take that
 * group's slots, and the players left over fill the open slots, strongest first.
 */
export function inFormation<P extends Player>(lineup: readonly P[], formation: Formation): P[] {
  const shape = FORMATIONS[formation];
  const slots = new Map<P, PositionGroup>();
  const spares: P[] = [];
  const open: PositionGroup[] = [];
  for (const group of GROUPS) {
    const own = lineup.filter((p) => p.group === group).sort((a, b) => b.strength - a.strength);
    for (const player of own.slice(0, shape[group])) slots.set(player, group);
    spares.push(...own.slice(shape[group]));
    open.push(...Array.from({ length: Math.max(0, shape[group] - own.length) }, () => group));
  }
  spares.sort((a, b) => b.strength - a.strength);
  spares.forEach((player, i) => slots.set(player, open[i] ?? player.group));
  return lineup.map((player) => ({ ...player, slot: slots.get(player) ?? player.group }));
}

/** The formation that leaves the fewest of these players out of position, the 4-4-2 on a tie. */
export function fittingFormation(lineup: readonly Player[]): Formation {
  const count = (group: PositionGroup) => lineup.filter((p) => p.group === group).length;
  const misfits = (formation: Formation) => GROUPS.reduce((sum, group) => sum + Math.max(0, FORMATIONS[formation][group] - count(group)), 0);
  const formations = Object.keys(FORMATIONS) as Formation[];
  return formations.reduce((best, formation) => (misfits(formation) < misfits(best) ? formation : best));
}
