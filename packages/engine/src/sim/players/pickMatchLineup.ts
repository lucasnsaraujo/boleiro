import type { Role } from "@boleiro/data/players";
import { arrange, FORMATION_NAMES, FORMATIONS, positionFit, SECONDARY_POSITION, type Formation } from "../../engine/formations.js";
import type { SimPlayer } from "../gameState.js";
import { effectiveStrength, type MatchContext } from "./effectiveStrength.js";
import { fatigueOn } from "./fatigueOn.js";
import { isInjured } from "./isInjured.js";

// guess: on top of what fatigue costs today, an AI coach values keeping a player fresh at this
// many strength points per full match of fatigue. A starter who played three days earlier
// (about 25 fatigue) then gives way to a fit backup up to 2.5 points weaker: rotation in
// congested weeks, while a week's rest leaves the best eleven alone.
const ROTATION_COST = 6;
// guess: a coach sticks with his usual starters over a fit backup up to this many points stronger,
// so a club opens the game with its real eleven and comes back to it after rotating.
const USUAL_STARTER_BONUS = 5;

/**
 * The AI coach's starting eleven in `formation`, in its slot order: fit players worth most in a slot,
 * by the strength they would play at today less a cost for the fatigue they carry, times their fit
 * in the slot (arrange). Injured players never start. A squad short in one position borrows the
 * players who fit its slots best from the others.
 */
export function pickMatchLineup(squad: readonly SimPlayer[], context: MatchContext, formation: Formation = "4-4-2", usual: ReadonlySet<string> = new Set()): SimPlayer[] {
  const fit: SimPlayer[] = [];
  const scores: number[] = [];
  const score = new Map<SimPlayer, number>();
  for (const p of squad) {
    if (isInjured(p, context.date)) continue;
    const value = effectiveStrength(p, context) - (ROTATION_COST * fatigueOn(p, context.date)) / 100 + (usual.has(p.id) ? USUAL_STARTER_BONUS : 0);
    fit.push(p);
    scores.push(value);
    score.set(p, value);
  }
  const pool = candidates(fit, formation, scores);
  return arrange(pool, formation, (p) => score.get(p) ?? 0).filter((p): p is SimPlayer => p !== null);
}

// Players per position kept as candidates beyond the slots the formation has for it.
const SPARE_CANDIDATES = 2;

/** Each formation's positions and how many slots it has for each. */
const NEEDS: Record<Formation, { roles: readonly Role[]; slots: readonly number[] }> = (() => {
  const needs = {} as Record<Formation, { roles: readonly Role[]; slots: readonly number[] }>;
  for (const name of FORMATION_NAMES) {
    const roles = [...new Set(FORMATIONS[name].map((slot) => slot.role))];
    needs[name] = { roles, slots: roles.map((role) => FORMATIONS[name].filter((slot) => slot.role === role).length) };
  }
  return needs;
})();

/**
 * The players worth arranging, in the squad's order: the best eleven, and for each position of the
 * formation the best few who play it as one of theirs. Anyone else would only be improvised behind
 * them, so leaving him out keeps arrange's work small: it runs for every club on every match day.
 */
function candidates(players: readonly SimPlayer[], formation: Formation, scores: readonly number[]): SimPlayer[] {
  const { roles, slots } = NEEDS[formation];
  // Best first; players as good keep the squad's order.
  const order = players.map((_, i) => i).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) || a - b);
  const isKept = new Uint8Array(players.length);
  const taken = new Int32Array(roles.length);
  let kept = 0;
  for (const i of order) {
    const player = players[i];
    if (!player) continue;
    let isWanted = kept < FORMATIONS[formation].length;
    for (let r = 0; r < roles.length; r++) {
      if (positionFit(player, roles[r] ?? "meia") < SECONDARY_POSITION || (taken[r] ?? 0) >= (slots[r] ?? 0) + SPARE_CANDIDATES) continue;
      taken[r] = (taken[r] ?? 0) + 1;
      isWanted = true;
    }
    if (isWanted) {
      isKept[i] = 1;
      kept++;
    }
  }
  return players.filter((_, i) => isKept[i]);
}
