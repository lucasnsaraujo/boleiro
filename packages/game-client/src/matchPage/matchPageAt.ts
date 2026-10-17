import type { GoalKind } from "@boleiro/engine/sim/live/goalDetails";
import { playerStatsAt, type PlayerStats } from "@boleiro/engine/sim/live/matchPlay";
import { matchEndOf, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { VarDecision, WrongCallKind } from "@boleiro/engine/sim/referees/refereeCalls";
import type { Side } from "../round/liveRoundOf.js";
import type { MatchPage } from "./matchPageOf.js";

export type PageEventKind = "goal" | "penaltyMiss" | "yellow" | "red" | "injury" | "substitution" | "varCheck" | "wrongCall";

/**
 * Something a player did, as the page lists it: `otherId` is who set a goal up, who went off for a
 * substitute, or the keeper who faced a penalty; a VAR check carries its `decision`, a wrong call that stood its `call`.
 */
export type PageEvent = {
  kind: PageEventKind;
  minute: number;
  side: Side;
  playerId: string;
  otherId?: string;
  goalKind?: GoalKind;
  isSaved?: boolean;
  decision?: VarDecision;
  call?: WrongCallKind;
};

export type StatKey = "possession" | "shots" | "onTarget" | "passes" | "tackles" | "fouls" | "cards" | "saves";
export type StatLine = { key: StatKey; label: string; home: number; away: number };

/** A match as it stood at a minute: the page's whole match when the minute is the final whistle. */
export type MatchView = {
  minute: number;
  /** The minute the match ends: 90, or 120 after extra time. */
  end: number;
  isOver: boolean;
  score: { home: number; away: number };
  events: PageEvent[];
  stats: StatLine[];
  /** Each side's attacking pressure per three minutes played so far, from 0 to 1 of the match's busiest spell. */
  pressure: { home: number[]; away: number[] };
  ratings: Record<string, number> | null;
  bestPlayerId: string | null;
  onPitch: { home: string[]; away: string[] };
};

export const PRESSURE_MINUTES = 3;
// What a spell's play weighs in its pressure: a shot most, more when on target, a goal more still; a completed pass a little.
const PRESSURE_WEIGHTS = { shot: 1, onTarget: 0.6, goal: 1.2, pass: 0.03 };
// Each spell leans on its neighbours, so a lone shot reads as a wave rather than a spike.
const SMOOTHING = [0.25, 0.5, 0.25];

type PlayerEvent = Extract<MatchEvent, { type: "goal" | "penaltyMiss" | "card" | "injury" | "substitution" | "varCheck" | "wrongCall" }>;

const isPlayerEvent = (event: MatchEvent): event is PlayerEvent =>
  event.type === "goal" ||
  event.type === "penaltyMiss" ||
  event.type === "card" ||
  event.type === "injury" ||
  event.type === "substitution" ||
  event.type === "varCheck" ||
  event.type === "wrongCall";

function pageEvent(event: PlayerEvent, homeId: string): PageEvent {
  const base = { minute: event.minute, side: event.clubId === homeId ? ("home" as const) : ("away" as const), playerId: event.playerId };
  switch (event.type) {
    case "goal":
      return { ...base, kind: "goal", goalKind: event.kind ?? "openPlay", ...(event.assistId ? { otherId: event.assistId } : {}) };
    case "penaltyMiss":
      return { ...base, kind: "penaltyMiss", otherId: event.keeperId, isSaved: event.isSaved };
    case "card":
      return { ...base, kind: event.card === "yellow" ? "yellow" : "red" };
    case "injury":
      return { ...base, kind: "injury" };
    case "substitution":
      return { ...base, kind: "substitution", otherId: event.offId };
    case "varCheck":
      return { ...base, kind: "varCheck", decision: event.decision };
    case "wrongCall":
      return { ...base, kind: "wrongCall", call: event.call };
  }
}

/**
 * Who is on the pitch for a side once `minute` has been played: the starters swapped by the
 * substitutions, less anyone sent off or hurt with nobody on for him. A hurt man's substitute comes
 * on at the same minute, listed after his injury.
 */
function onPitchOf(page: MatchPage, side: Side, events: readonly PageEvent[]): string[] {
  const own = events.filter((e) => e.side === side);
  const replaced = new Set(own.flatMap((e) => (e.kind === "substitution" && e.otherId ? [e.otherId] : [])));
  let players = page[side].starters.map((p) => p.id);
  for (const e of own) {
    if (e.kind === "substitution") players = players.map((id) => (id === e.otherId ? e.playerId : id));
    if (e.kind === "red" || (e.kind === "injury" && !replaced.has(e.playerId))) players = players.filter((id) => id !== e.playerId);
  }
  return players;
}

const sum = (stats: readonly PlayerStats[], pick: (s: PlayerStats) => number) => stats.reduce((total, s) => total + pick(s), 0);

function sideTotals(page: MatchPage, minute: number) {
  const stats = page.play ? Object.values(playerStatsAt(page.play, page.events, minute)) : [];
  const of = (clubId: string) => stats.filter((s) => s.clubId === clubId);
  return { home: of(page.home.club.id), away: of(page.away.club.id) };
}

function statLines(page: MatchPage, minute: number, events: readonly PageEvent[]): StatLine[] {
  const cards = (side: Side) => events.filter((e) => e.side === side && (e.kind === "yellow" || e.kind === "red")).length;
  const cardLine: StatLine = { key: "cards", label: "Cartões", home: cards("home"), away: cards("away") };
  if (!page.play) return [cardLine];
  const { home, away } = sideTotals(page, minute);
  const line = (key: StatKey, label: string, pick: (s: PlayerStats) => number): StatLine => ({ key, label, home: sum(home, pick), away: sum(away, pick) });
  const passes = line("passes", "Passes certos", (s) => s.passes);
  const total = passes.home + passes.away;
  const homeShare = total ? Math.round((100 * passes.home) / total) : 50;
  return [
    { key: "possession", label: "Posse de bola", home: homeShare, away: 100 - homeShare },
    line("shots", "Finalizações", (s) => s.shots),
    line("onTarget", "No alvo", (s) => s.shotsOnTarget),
    passes,
    line("tackles", "Desarmes", (s) => s.tackles),
    line("fouls", "Faltas", (s) => s.fouls),
    cardLine,
    line("saves", "Defesas", (s) => s.saves),
  ];
}

/** Each side's pressure per spell of three minutes up to `minute`, from its shots, goals and passes in the spell. */
function pressureOf(page: MatchPage, minute: number): MatchView["pressure"] {
  const spells = Math.ceil(Math.min(minute, matchEndOf(page.events)) / PRESSURE_MINUTES);
  if (!page.play || spells === 0) return { home: [], away: [] };
  const weightAt = (at: number) => {
    const { home, away } = sideTotals(page, at);
    const weigh = (stats: readonly PlayerStats[]) =>
      PRESSURE_WEIGHTS.shot * sum(stats, (s) => s.shots) +
      PRESSURE_WEIGHTS.onTarget * sum(stats, (s) => s.shotsOnTarget) +
      PRESSURE_WEIGHTS.goal * sum(stats, (s) => s.goals) +
      PRESSURE_WEIGHTS.pass * sum(stats, (s) => s.passes);
    return { home: weigh(home), away: weigh(away) };
  };
  const totals = Array.from({ length: spells + 1 }, (_, i) => weightAt(Math.min(minute, i * PRESSURE_MINUTES)));
  const raw = (side: Side) => totals.slice(1).map((t, i) => t[side] - (totals[i]?.[side] ?? 0));
  const smooth = (values: readonly number[]) =>
    values.map((_, i) => SMOOTHING.reduce((total, w, k) => total + w * (values[Math.min(values.length - 1, Math.max(0, i + k - 1))] ?? 0), 0));
  const home = smooth(raw("home"));
  const away = smooth(raw("away"));
  const peak = Math.max(1e-9, ...home, ...away);
  return { home: home.map((v) => v / peak), away: away.map((v) => v / peak) };
}

/** The match at `minute`: its score, what happened so far, its numbers and pressure, and its marks once it is over. */
export function matchPageAt(page: MatchPage, minute: number): MatchView {
  const end = matchEndOf(page.events);
  const at = Math.min(minute, end);
  const isOver = !page.isLive || at >= end;
  const shown = isOver ? end : at;
  const events = page.events.filter((e): e is PlayerEvent => isPlayerEvent(e) && e.minute <= shown).map((e) => pageEvent(e, page.home.club.id));
  const goals = (side: Side) => events.filter((e) => e.kind === "goal" && e.side === side).length;
  const ratings = isOver ? page.ratings : null;
  const bestPlayerId = ratings ? (Object.entries(ratings).reduce<[string, number] | null>((best, entry) => (!best || entry[1] > best[1] ? entry : best), null)?.[0] ?? null) : null;
  return {
    minute: shown,
    end,
    isOver,
    score: { home: goals("home"), away: goals("away") },
    events,
    stats: statLines(page, shown, events),
    pressure: pressureOf(page, shown),
    ratings,
    bestPlayerId,
    onPitch: { home: onPitchOf(page, "home", events), away: onPitchOf(page, "away", events) },
  };
}
