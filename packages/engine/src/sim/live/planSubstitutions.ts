import type { Role } from "@boleiro/data/players";
import { positionFit } from "../../engine/formations.js";
import type { PositionGroup } from "../../engine/match.js";
import type { MatchPlan } from "../coach/matchPlan.js";
import type { IsoDate, SimPlayer } from "../gameState.js";
import { fatigueOn } from "../players/fatigueOn.js";
import { EXTRA_TIME_SUBSTITUTIONS, EXTRA_TIME_WINDOWS, isFreeWindow, MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS } from "./aiSubstitutions.js";
import { FULL_TIME, type MatchEvent } from "./matchTimeline.js";

// guess: on the in-match scale a player under 29 spends 40 points of energy over ninety minutes, so a
// fresh one ends a match at 60%; past 28 he spends 2 more a year, as tirednessOn ages the AI's legs.
const DRAIN_PER_MATCH = 40;
const DRAIN_PER_YEAR = 2;
const DRAIN_FROM_AGE = 28;
const MATCH_MINUTES = 90;

/** A player's energy after `minutesPlayed` of a match on `date`, 0–100: the energy he started with (100 less his fatigue), less what the minutes cost. */
export function energyAt(player: SimPlayer, date: IsoDate, minutesPlayed: number): number {
  const drain = DRAIN_PER_MATCH + DRAIN_PER_YEAR * Math.max(0, player.age - DRAIN_FROM_AGE);
  return Math.max(0, Math.min(100, 100 - fatigueOn(player, date) - (drain * minutesPlayed) / MATCH_MINUTES));
}

const GROUP_ROLE: Record<PositionGroup, Role> = { GK: "goleiro", DEF: "zagueiro", MID: "meia", ATT: "atacante" };
const roleOf = (p: SimPlayer): Role => p.positions?.[0] ?? GROUP_ROLE[p.group];
/** The outfield lines from the front back: the line that gives up a man for a red card is looked for in this order. */
const FRONT_TO_BACK: readonly PositionGroup[] = ["ATT", "MID", "DEF"];

/** One human coach's side of a match, as his plan reads it. */
export type PlanSide = {
  clubId: string;
  plan: MatchPlan;
  starters: readonly SimPlayer[];
  /** Who may come on: fit, not suspended, not starting. */
  bench: readonly SimPlayer[];
  /** The strength each player plays at today. */
  strength: (p: SimPlayer) => number;
  date: IsoDate;
};

/** A red card or an injury of the side the plan answered, so its window doesn't open. */
export type PlanAnswer = { minute: number; playerId: string };

/** What a plan does at a minute: its substitutions, and the red cards and injuries it answered. */
export type PlanMove = { minute: number; substitutions: { offId: string; onId: string }[]; answered: PlanAnswer[] };

/** Who of a side is on the pitch at `minute`, after the substitutions made by then, with the minute each came on. */
function elevenAt(side: PlanSide, events: readonly MatchEvent[], minute: number): Map<string, { player: SimPlayer; cameOn: number }> {
  const byId = new Map(side.bench.map((p) => [p.id, p]));
  const eleven = new Map(side.starters.map((player) => [player.id, { player, cameOn: 0 }]));
  for (const e of events) {
    if (e.minute > minute || e.type !== "substitution" || e.clubId !== side.clubId) continue;
    const on = byId.get(e.playerId);
    if (on && eleven.delete(e.offId)) eleven.set(on.id, { player: on, cameOn: e.minute });
  }
  return eleven;
}

/**
 * The plan's move at `minute`, or null when it has nothing to do then. In order: each red card and
 * injury of the minute, then the substitutions planned for it, then anyone whose energy fell below the
 * floor, within Law 3's substitutions and opportunities (a sixth and a fourth in extra time).
 *
 * - Hurt: his named substitute comes on, or with the shape kept the best fit for his position from his
 *   line on the bench.
 * - Sent off, with the shape kept: the lines behind his stay as they are and his is refilled from the
 *   bench (his named substitute if he plays that line, else the best fit), while the weakest player of
 *   the most advanced line in front of his that still has two or more makes way. A forward sent off, or
 *   a line no other can spare a man for, plays on a man short: the plan answers by changing nothing. A
 *   keeper sent off always brings the reserve keeper on.
 * - Tired: an outfield player whose energy is below the floor makes way for his named substitute or
 *   the best fit from his line, the most tired first.
 *
 * A red card or injury the plan has no answer for (no rule, or nobody to bring on) is left to the coach.
 */
function moveAt(side: PlanSide, events: readonly MatchEvent[], minute: number): PlanMove | null {
  const { plan, clubId } = side;
  const made = events.filter((e) => e.type === "substitution" && e.clubId === clubId && e.minute <= minute);
  const windows = new Set(made.flatMap((e) => (isFreeWindow(e.minute) ? [] : [e.minute])));
  const isExtraTime = minute >= FULL_TIME;
  const most = MAX_SUBSTITUTIONS + (isExtraTime ? EXTRA_TIME_SUBSTITUTIONS : 0);
  const mostWindows = MAX_SUBSTITUTION_WINDOWS + (isExtraTime ? EXTRA_TIME_WINDOWS : 0);
  const isWindowOpen = isFreeWindow(minute) || windows.has(minute) || windows.size < mostWindows;
  const sentOff = new Set(events.flatMap((e) => (e.type === "card" && e.card !== "yellow" && e.minute <= minute ? [e.playerId] : [])));
  const hurtBefore = new Set(events.flatMap((e) => (e.type === "injury" && e.minute < minute ? [e.playerId] : [])));
  const eleven = elevenAt(side, events, minute);
  const played = new Set([...side.starters.map((p) => p.id), ...made.flatMap((e) => (e.type === "substitution" ? [e.playerId] : []))]);

  const substitutions: PlanMove["substitutions"] = [];
  const answered: PlanAnswer[] = [];
  const leaving = new Set<string>();
  const coming = new Set<string>();
  const canSubstitute = () => isWindowOpen && made.length + substitutions.length < most;
  const isFree = (p: SimPlayer) => !played.has(p.id) && !coming.has(p.id);
  const onPitch = () => [...eleven.values()].map((e) => e.player).filter((p) => !sentOff.has(p.id) && !hurtBefore.has(p.id) && !leaving.has(p.id));
  const named = (playerId: string, group?: PositionGroup) => {
    const subId = plan.namedSubs?.[playerId];
    const sub = side.bench.find((p) => p.id === subId);
    return sub && isFree(sub) && (!group || sub.group === group) ? sub : undefined;
  };
  // The bench player of the line who plays the position best, at today's strength.
  const bestFit = (group: PositionGroup, role: Role) => {
    let best: SimPlayer | undefined;
    let bestValue = -Infinity;
    for (const p of side.bench) {
      if (p.group !== group || !isFree(p)) continue;
      const value = side.strength(p) * positionFit(p, role);
      if (value > bestValue) [best, bestValue] = [p, value];
    }
    return best;
  };
  const substitute = (off: SimPlayer, on: SimPlayer) => {
    substitutions.push({ offId: off.id, onId: on.id });
    leaving.add(off.id);
    coming.add(on.id);
  };

  for (const e of events) {
    const isIncident = e.type === "injury" || (e.type === "card" && e.card !== "yellow");
    if (e.minute !== minute || !isIncident || e.clubId !== clubId) continue;
    const player = eleven.get(e.playerId)?.player;
    if (!player || leaving.has(player.id)) continue;
    if (e.type === "injury") {
      const on = named(player.id) ?? (plan.keepsShape ? bestFit(player.group, roleOf(player)) : undefined);
      if (!on || !canSubstitute()) continue;
      substitute(player, on);
      answered.push({ minute, playerId: player.id });
    }
    if (e.type === "card" && e.card !== "yellow" && plan.keepsShape) {
      const left = onPitch();
      const payer = player.group === "ATT" ? undefined : FRONT_TO_BACK.find((group) => group !== player.group && isInFront(group, player.group) && left.filter((p) => p.group === group).length >= 2);
      if (!payer && player.group !== "GK") {
        answered.push({ minute, playerId: player.id });
        continue;
      }
      const off = payer && weakest(left.filter((p) => p.group === payer), side.strength);
      const on = named(player.id, player.group) ?? bestFit(player.group, roleOf(player));
      if (!off || !on || !canSubstitute()) continue;
      substitute(off, on);
      answered.push({ minute, playerId: player.id });
    }
  }

  for (const planned of plan.minuteSubs ?? []) {
    if (planned.minute !== minute) continue;
    const off = onPitch().find((p) => p.id === planned.offId);
    const on = side.bench.find((p) => p.id === planned.onId);
    if (off && on && isFree(on) && canSubstitute()) substitute(off, on);
  }

  const floor = plan.energyFloor;
  if (floor !== undefined) {
    const energy = (id: string) => {
      const at = eleven.get(id);
      return at ? energyAt(at.player, side.date, minute - at.cameOn) : 100;
    };
    const tired = onPitch()
      .filter((p) => p.group !== "GK" && energy(p.id) < floor)
      .sort((a, b) => energy(a.id) - energy(b.id));
    for (const player of tired) {
      const on = named(player.id) ?? bestFit(player.group, roleOf(player));
      if (on && canSubstitute()) substitute(player, on);
    }
  }

  return substitutions.length || answered.length ? { minute, substitutions, answered } : null;
}

/** Whether `line` stands in front of `behind`: the attack in front of the midfield, in front of the defence, in front of the keeper. */
function isInFront(line: PositionGroup, behind: PositionGroup): boolean {
  const order: readonly PositionGroup[] = ["GK", "DEF", "MID", "ATT"];
  return order.indexOf(line) > order.indexOf(behind);
}

function weakest(players: readonly SimPlayer[], strength: (p: SimPlayer) => number): SimPlayer | undefined {
  let found: SimPlayer | undefined;
  for (const p of players) if (!found || strength(p) < strength(found)) found = p;
  return found;
}

/** The plan's first move after minute `after` and before the match ends at `end`, or null when it has none left. */
export function nextPlanMove(side: PlanSide, events: readonly MatchEvent[], after: number, end: number): PlanMove | null {
  for (let minute = after + 1; minute < end; minute++) {
    const move = moveAt(side, events, minute);
    if (move) return move;
  }
  return null;
}

/** Whether a plan has any rule that substitutes or answers during a match. */
export const isPlanActive = (plan: MatchPlan): boolean =>
  plan.keepsShape === true || Object.keys(plan.namedSubs ?? {}).length > 0 || plan.energyFloor !== undefined || (plan.minuteSubs?.length ?? 0) > 0;
