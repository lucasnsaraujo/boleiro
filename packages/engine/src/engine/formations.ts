import { GROUP_OF_ROLE, type Lane, type Role } from "@boleiro/data/players";
import { KEEPER_SWAP, OUT_OF_POSITION, type Player, type PositionGroup } from "./match.js";

/**
 * Players per line, back to front, of each formation a side can play: the five the game always had,
 * then every one FotMob showed for a Brazilian club's last match (October 2026).
 */
const LINES = {
  "4-4-2": [4, 4, 2],
  "4-3-3": [4, 3, 3],
  "4-5-1": [4, 5, 1],
  "5-3-2": [5, 3, 2],
  "3-5-2": [3, 5, 2],
  "4-2-3-1": [4, 2, 3, 1],
  "4-1-4-1": [4, 1, 4, 1],
  "3-4-2-1": [3, 4, 2, 1],
  "3-4-3": [3, 4, 3],
  "5-4-1": [5, 4, 1],
  "4-1-3-2": [4, 1, 3, 2],
} as const satisfies Record<string, readonly number[]>;

export type Formation = keyof typeof LINES;

/** A place in a formation: its position, and where it stands on a pitch attacking upwards, in percent: `x` from the left touchline, `y` from the far goal line. */
export type Slot = { role: Role; x: number; y: number };

// guess: a player in one of his other positions plays at 97% (the approved lineup mock shows −3%).
// Anywhere else he plays at OUT_OF_POSITION, and a keeper outfield, or an outfielder in goal, at KEEPER_SWAP.
export const SECONDARY_POSITION = 0.97;

// Where the lines stand, from the back line to the front one, and how far apart a line's players stand.
const BACK_LINE_Y = 74;
const FRONT_LINE_Y = 10;
const KEEPER_Y = 90;
// A back four's full-backs, and the wing-backs of a back three, push up this much past their line.
const FULL_BACK_PUSH = 6;
const SPACING: Record<number, number> = { 1: 0, 2: 34, 3: 32 };
const WIDE_SPAN = 72;

/**
 * The positions of a line: a back four or five has full-backs at its ends, a back three's next line
 * of four or more has them as wing-backs, the front line is forwards and the lines between midfielders.
 */
function lineRoles(line: number, count: number, lines: readonly number[]): Role[] {
  const last = lines.length - 1;
  if (line === last) return Array<Role>(count).fill("atacante");
  if (line === 0) return count >= 4 ? ["lateral", ...Array<Role>(count - 2).fill("zagueiro"), "lateral"] : Array<Role>(count).fill("zagueiro");
  const hasWingBacks = line === 1 && lines[0] === 3 && count >= 4;
  if (hasWingBacks) return ["lateral", ...Array<Role>(count - 2).fill("meia"), "lateral"];
  // Behind a lone striker, a line of three or four has wingers at its ends: Brazil's pontas of the 4-2-3-1 and 4-1-4-1.
  const hasWingers = line === last - 1 && lines[last] === 1 && lines.length === 4 && count >= 3;
  return hasWingers ? ["atacante", ...Array<Role>(count - 2).fill("meia"), "atacante"] : Array<Role>(count).fill("meia");
}

function slotsOf(lines: readonly number[]): Slot[] {
  const step = (BACK_LINE_Y - FRONT_LINE_Y) / (lines.length - 1);
  const outfield = lines.flatMap((count, line) => {
    const spacing = SPACING[count] ?? WIDE_SPAN / (count - 1);
    return lineRoles(line, count, lines).map((role, i) => {
      const x = 50 + (i - (count - 1) / 2) * spacing;
      const y = BACK_LINE_Y - line * step - (role === "lateral" ? FULL_BACK_PUSH : 0);
      return { role, x: Math.round(x), y: Math.round(y) };
    });
  });
  return [{ role: "goleiro", x: 50, y: KEEPER_Y }, ...outfield];
}

export const FORMATION_NAMES = Object.keys(LINES) as Formation[];

/** Each formation's eleven slots: the keeper, then line by line from the back, left to right. */
export const FORMATIONS: Record<Formation, readonly Slot[]> = (() => {
  const slots = {} as Record<Formation, readonly Slot[]>;
  for (const name of FORMATION_NAMES) slots[name] = slotsOf(LINES[name]);
  return slots;
})();

export function isFormation(name: string): name is Formation {
  return name in LINES;
}

/** The share of his strength a player plays at in a slot of this position: a player the data gives no positions plays his whole group as his own. */
export function positionFit(player: Pick<Player, "group" | "positions">, role: Role): number {
  const group = GROUP_OF_ROLE[role];
  if (group === "GK" || player.group === "GK") return group === player.group ? 1 : KEEPER_SWAP;
  const positions = player.positions ?? [];
  if (!positions.length) return group === player.group ? 1 : OUT_OF_POSITION;
  if (positions[0] === role) return 1;
  return positions.includes(role) ? SECONDARY_POSITION : OUT_OF_POSITION;
}

// Rounds of swaps after the first fill; an eleven settles in two or three.
const MAX_SWAP_ROUNDS = 10;
const GAIN = 1e-9;

/**
 * The formation's slots filled from `players`, at most one player per slot, for an eleven worth as
 * much as it can (each player's `value` times his fit in his slot): first the pair worth most, then
 * the next among the players and slots left (ties keep the players' order, then the slots'), then
 * any swap of two slots' players, or of a slot's player for one left out, that adds worth, until
 * none does. That reaches the best eleven for the elevens AI picks hand it; on a whole squad it can
 * fall a few points short of the best. A slot left empty (fewer players than slots) is null.
 */
export function arrange<P extends Player>(players: readonly P[], formation: Formation, value: (player: P) => number = (p) => p.strength): (P | null)[] {
  const slots = FORMATIONS[formation];
  const m = slots.length;
  // Worth of player p in slot s at [p * m + s]; an empty slot is -1 in `filled`. Runs for every
  // eleven of every match, so it keeps to typed arrays.
  const worth = new Float64Array(players.length * m);
  players.forEach((player, p) => {
    const playerValue = value(player);
    const byRole = new Map<Role, number>();
    slots.forEach((slot, s) => {
      let fit = byRole.get(slot.role);
      if (fit === undefined) byRole.set(slot.role, (fit = positionFit(player, slot.role)));
      worth[p * m + s] = playerValue * fit;
    });
  });
  const filled = new Int32Array(m).fill(-1);
  const isPlaced = new Uint8Array(players.length);
  for (let count = Math.min(players.length, m); count > 0; count--) {
    let best = -1;
    for (let pair = 0; pair < worth.length; pair++) {
      if (isPlaced[Math.floor(pair / m)] || filled[pair % m] !== -1) continue;
      if (best < 0 || (worth[pair] ?? 0) > (worth[best] ?? 0)) best = pair;
    }
    filled[best % m] = Math.floor(best / m);
    isPlaced[Math.floor(best / m)] = 1;
  }
  const at = (p: number, s: number) => (p < 0 ? 0 : (worth[p * m + s] ?? 0));
  for (let round = 0, isBetter = true; isBetter && round < MAX_SWAP_ROUNDS; round++) {
    isBetter = false;
    for (let s = 0; s < m; s++) {
      for (let t = s + 1; t < m; t++) {
        const a = filled[s] ?? -1;
        const b = filled[t] ?? -1;
        if (at(b, s) + at(a, t) > at(a, s) + at(b, t) + GAIN) {
          filled[s] = b;
          filled[t] = a;
          isBetter = true;
        }
      }
      for (let out = 0; out < players.length; out++) {
        const current = filled[s] ?? -1;
        if (isPlaced[out] || at(out, s) <= at(current, s) + GAIN) continue;
        if (current >= 0) isPlaced[current] = 0;
        filled[s] = out;
        isPlaced[out] = 1;
        isBetter = true;
      }
    }
  }
  return Array.from(filled, (p) => (p < 0 ? null : (players[p] ?? null)));
}

// A slot this close to a touchline plays down that flank; the rest play through the middle.
const FLANK_X = 30;

/** The third of the pitch a slot stands in. */
export function laneOf(slot: Slot): Lane {
  if (slot.x < FLANK_X) return "left";
  return slot.x > 100 - FLANK_X ? "right" : "centre";
}

/**
 * The eleven, in its own order, each with his slot's group, its lane and the share of his strength he
 * plays at there (arrange). A player beyond the formation's slots keeps his own group and plays through the middle.
 */
export function inFormation<P extends Player>(lineup: readonly P[], formation: Formation): (P & { slot: PositionGroup; fit: number; lane: Lane })[] {
  const slots = FORMATIONS[formation];
  // An eleven already in slot order with everyone in his main position can't be placed better: no arranging.
  const isInPlace = lineup.length === slots.length && lineup.every((player, s) => slots[s] && positionFit(player, slots[s].role) === 1);
  if (isInPlace) return lineup.map((player, s) => ({ ...player, slot: GROUP_OF_ROLE[slots[s]?.role ?? "meia"], fit: 1, lane: slots[s] ? laneOf(slots[s]) : "centre" }));
  const at = new Map<P, Slot>();
  arrange(lineup, formation).forEach((player, s) => {
    const slot = slots[s];
    if (player && slot) at.set(player, slot);
  });
  return lineup.map((player) => {
    const slot = at.get(player);
    return slot ? { ...player, slot: GROUP_OF_ROLE[slot.role], fit: positionFit(player, slot.role), lane: laneOf(slot) } : { ...player, slot: player.group, fit: 1, lane: "centre" as const };
  });
}

/** How much the best eleven of these players is worth in the formation: each one's strength times his fit in his slot. */
function formationWorth(players: readonly Player[], formation: Formation): number {
  const slots = FORMATIONS[formation];
  return arrange(players, formation).reduce((sum, player, s) => {
    const slot = slots[s];
    return player && slot ? sum + player.strength * positionFit(player, slot.role) : sum;
  }, 0);
}

/** The formation whose best eleven of these players is worth most; the earlier formation of FORMATION_NAMES on a tie. */
export function fittingFormation(players: readonly Player[]): Formation {
  let best: Formation = "4-4-2";
  let bestWorth = -Infinity;
  for (const formation of FORMATION_NAMES) {
    const worth = formationWorth(players, formation);
    if (worth > bestWorth + 1e-9) {
      best = formation;
      bestWorth = worth;
    }
  }
  return best;
}
