import type { IsoDate, SimPlayer } from "../gameState.js";
import { fatigueOn } from "../players/fatigueOn.js";
import type { MatchEvent } from "./matchTimeline.js";

// IFAB Laws of the Game 2025/26, Law 3.1: up to five substitutes, used in at most three
// opportunities during the match; substitutions at half-time do not use one.
export const MAX_SUBSTITUTIONS = 5;
export const MAX_SUBSTITUTION_WINDOWS = 3;
const HALF_TIME = 45;
const FULL_TIME = 90;

// guess: an AI club names its twelve best fit players outside the eleven as substitutes.
const BENCH_SIZE = 12;

// ESPN's public match summaries of the 760 Série A matches of 2024 and 2025 (keyEvents
// "Substitution"), fetched 2026-10-15: of 1,520 sides, 1,224 made five substitutions or more, 188
// four, 64 three and 11 two.
const SUBSTITUTIONS_MADE: readonly (readonly [number, number])[] = [
  [5, 1257],
  [4, 188],
  [3, 64],
  [2, 11],
];
// The same 7,291 substitutions by the 15-minute band they came in: 44, 88, 922, 665, 2,824, 2,748.
// The 31st to 45th minute holds the half-time changes; earlier ones are left to injuries.
const WINDOW_BANDS: readonly (readonly [number, number, number])[] = [
  [HALF_TIME, HALF_TIME, 922],
  [46, 60, 665],
  [61, 75, 2824],
  [76, 88, 2748],
];
// guess: for who an AI coach takes off first, a player tires this much more per year past 28.
const TIREDNESS_PER_YEAR = 3;
const TIRING_FROM_AGE = 28;

/** How tired a player starts a match on `date`: the fatigue he carries, more for older legs. */
export function tirednessOn(player: SimPlayer, date: IsoDate): number {
  return fatigueOn(player, date) + TIREDNESS_PER_YEAR * Math.max(0, player.age - TIRING_FROM_AGE);
}

// guess: an AI coach who is losing from the hour on swaps a defender or midfielder for a forward.
const CHASE_FROM_MINUTE = 60;

function weighted<T>(items: readonly (readonly [T, number])[], random: () => number): T | undefined {
  let roll = random() * items.reduce((sum, [, w]) => sum + w, 0);
  return items.find(([, w]) => (roll -= w) < 0)?.[0] ?? items.at(-1)?.[0];
}

/** The best fit players outside the eleven, strongest first, as an AI club names its substitutes. */
export function aiBench(squad: readonly SimPlayer[], lineup: readonly SimPlayer[], isFit: (p: SimPlayer) => boolean): SimPlayer[] {
  const starting = new Set(lineup.map((p) => p.id));
  return squad
    .filter((p) => !starting.has(p.id) && isFit(p))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, BENCH_SIZE);
}

/** Who is on the pitch for a side at `minute`: the starters swapped by the substitutions made by then, less anyone sent off or hurt before it. */
export function onPitchAt(starters: readonly SimPlayer[], bench: readonly SimPlayer[], events: readonly MatchEvent[], clubId: string, minute: number): SimPlayer[] {
  const byId = new Map(bench.map((p) => [p.id, p]));
  let players = [...starters];
  const gone = new Set<string>();
  for (const event of events) {
    if (event.minute > minute || !("clubId" in event)) continue;
    if (event.type === "substitution" && event.clubId === clubId) {
      const on = byId.get(event.playerId);
      if (on) players = players.map((p) => (p.id === event.offId ? on : p));
    }
    const isOut = (event.type === "card" && event.card !== "yellow") || event.type === "injury";
    if (isOut && event.minute < minute) gone.add(event.playerId);
  }
  return players.filter((p) => !gone.has(p.id));
}

/** The last minute each player does something in the match: comes on, scores, assists, is booked, hurt or faces a penalty. */
function lastInvolvements(events: readonly MatchEvent[]): Map<string, number> {
  const last = new Map<string, number>();
  const involve = (playerId: string, minute: number) => last.set(playerId, Math.max(minute, last.get(playerId) ?? 0));
  for (const e of events) {
    if (e.type === "halfTime" || e.type === "fullTime" || e.type === "shootoutKick" || e.type === "orderOverruled") continue;
    involve(e.playerId, e.minute);
    if (e.type === "goal" && e.assistId) involve(e.assistId, e.minute);
    if (e.type === "penaltyMiss") involve(e.keeperId, e.minute);
  }
  return last;
}

export type AiSide = {
  clubId: string;
  starters: readonly SimPlayer[];
  bench: readonly SimPlayer[];
  /** How tired a player is before the match; the most tired come off first. */
  tiredness: (p: SimPlayer) => number;
};

/**
 * An AI coach's substitutions after `from`, on top of the match's other events: a hurt player
 * comes off at once, a keeper or defender sent off is replaced by one of his own for a forward, and
 * the rest come in at Série A's usual count and minutes, like for like, or a forward for a defender
 * or midfielder when the side is losing late on. Nobody comes off before his last goal, assist,
 * card or injury, and the side keeps to Law 3.
 */
export function aiSubstitutions(side: AiSide, events: readonly MatchEvent[], from: number, goalDifferenceAt: (minute: number) => number, random: () => number): MatchEvent[] {
  const { clubId } = side;
  const made: MatchEvent[] = events.filter((e) => e.type === "substitution" && e.clubId === clubId);
  const windows = new Set(made.filter((e) => e.minute !== HALF_TIME).map((e) => e.minute));
  const used = new Set(made.flatMap((e) => (e.type === "substitution" ? [e.playerId] : [])));
  const planned = weighted(SUBSTITUTIONS_MADE, random) ?? MAX_SUBSTITUTIONS;
  const windowMinutes = Array.from({ length: MAX_SUBSTITUTION_WINDOWS }, () => {
    const [first, last] = weighted(WINDOW_BANDS.map(([a, b, w]) => [[a, b] as const, w] as const), random) ?? [HALF_TIME, HALF_TIME];
    return first + Math.floor(random() * (last - first + 1));
  });
  const perWindow = Math.ceil(planned / MAX_SUBSTITUTION_WINDOWS);
  type Moment = { minute: number; reason: "hurt" | "sentOff" | "planned"; playerId: string };
  const moments = [
    ...events.flatMap((e): Moment[] => {
      if (e.type === "injury" && e.clubId === clubId) return [{ minute: e.minute, reason: "hurt", playerId: e.playerId }];
      if (e.type === "card" && e.card !== "yellow" && e.clubId === clubId) return [{ minute: e.minute, reason: "sentOff", playerId: e.playerId }];
      return [];
    }),
    ...windowMinutes.map((minute): Moment => ({ minute, reason: "planned", playerId: "" })),
  ]
    .filter((m) => m.minute > from && m.minute < FULL_TIME)
    .sort((a, b) => a.minute - b.minute);

  const subs: MatchEvent[] = [];
  const all = () => [...events, ...subs];
  const last = lastInvolvements(events);
  const lastInvolvement = (p: SimPlayer) => last.get(p.id) ?? 0;
  const sentOff = new Set(events.flatMap((e) => (e.type === "card" && e.card !== "yellow" ? [e.playerId] : [])));
  const tiredness = new Map<string, number>();
  const tirednessOf = (p: SimPlayer) => {
    if (!tiredness.has(p.id)) tiredness.set(p.id, side.tiredness(p));
    return tiredness.get(p.id) ?? 0;
  };
  const canUseWindow = (minute: number) => minute === HALF_TIME || windows.has(minute) || windows.size < MAX_SUBSTITUTION_WINDOWS;
  const substitute = (minute: number, off: SimPlayer, on: SimPlayer) => {
    subs.push({ type: "substitution", minute, clubId, playerId: on.id, offId: off.id });
    last.set(on.id, Math.max(minute, last.get(on.id) ?? 0));
    used.add(on.id);
    if (minute !== HALF_TIME) windows.add(minute);
  };
  const freeBench = () => side.bench.filter((p) => !used.has(p.id));
  const bestOf = (players: readonly SimPlayer[]) => [...players].sort((a, b) => b.strength - a.strength)[0];

  for (const moment of moments) {
    const { minute } = moment;
    if (made.length + subs.length >= MAX_SUBSTITUTIONS || !canUseWindow(minute)) continue;
    const onPitch = onPitchAt(side.starters, side.bench, all(), clubId, minute);
    const canLeave = (p: SimPlayer) => !sentOff.has(p.id) && lastInvolvement(p) <= minute && (moment.reason === "hurt" || p.id !== moment.playerId);
    if (moment.reason === "hurt") {
      const hurt = onPitch.find((p) => p.id === moment.playerId);
      const on = hurt && (bestOf(freeBench().filter((p) => p.group === hurt.group)) ?? bestOf(freeBench()));
      if (hurt && on && lastInvolvement(hurt) <= minute) substitute(minute, hurt, on);
      continue;
    }
    if (moment.reason === "sentOff") {
      const group = side.starters.concat(side.bench).find((p) => p.id === moment.playerId)?.group;
      if (group !== "GK" && group !== "DEF") continue;
      const on = bestOf(freeBench().filter((p) => p.group === group));
      const off = [...onPitch].filter(canLeave).sort((a, b) => (a.group === "ATT" ? 0 : 1) - (b.group === "ATT" ? 0 : 1) || a.strength - b.strength)[0];
      if (on && off && off.group !== "GK") substitute(minute, off, on);
      continue;
    }
    const isChasing = minute >= CHASE_FROM_MINUTE && goalDifferenceAt(minute) < 0;
    for (let i = 0; i < perWindow && made.length + subs.length < planned && canUseWindow(minute); i++) {
      const leaving = onPitchAt(side.starters, side.bench, all(), clubId, minute).filter((p) => p.group !== "GK" && canLeave(p));
      const tiredFirst = leaving.sort((a, b) => tirednessOf(b) - tirednessOf(a));
      const off = isChasing ? (tiredFirst.find((p) => p.group === "DEF") ?? tiredFirst.find((p) => p.group === "MID")) : tiredFirst[0];
      const on = off && (isChasing ? bestOf(freeBench().filter((p) => p.group === "ATT")) : bestOf(freeBench().filter((p) => p.group === off.group)));
      if (!off || !on) break;
      substitute(minute, off, on);
    }
  }
  return subs;
}

/** Everyone who took part for a side and the minutes of those who did not play the whole match. */
export function whoPlayed(starters: readonly SimPlayer[], bench: readonly SimPlayer[], events: readonly MatchEvent[], clubId: string): { players: SimPlayer[]; minutes: Map<string, number> } {
  const byId = new Map(bench.map((p) => [p.id, p]));
  const players = [...starters];
  const minutes = new Map<string, number>();
  const cameOn = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "substitution" || event.clubId !== clubId) continue;
    const on = byId.get(event.playerId);
    if (!on) continue;
    players.push(on);
    minutes.set(event.offId, event.minute - (cameOn.get(event.offId) ?? 0));
    cameOn.set(on.id, event.minute);
    minutes.set(on.id, FULL_TIME - event.minute);
  }
  return { players, minutes };
}
