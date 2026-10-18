import { addDays } from "../../dates.js";
import type { Fixture, SimPlayer } from "../../gameState.js";
import { clubMood } from "../../morale/clubMood.js";
import { rivalsOf } from "../../morale/rivalsOf.js";
import { isInjured } from "../../players/isInjured.js";
import { BLOCK_FROM_INTENSITY } from "../../rivalries/idols.js";
import { isClassico, rivalryOf } from "../../rivalries/rivalryOf.js";
import { isWindowOpen } from "../../transfers/transferWindows.js";
import { eventMemoryOf, rivalryKey, type Cast } from "../eventMemory.js";
import type { EventScene } from "../eventType.js";

// What the bank's preconditions read of the game. Every event size in the bank is a guess judged
// against what a match moves (a win moves squad morale by about 5 points and the fans by about 7,
// reactToDay), so an event weighs less than a match, and money against the club's own wage bill so it
// scales from Série A to Série D.

export const fit = (scene: EventScene) => scene.squad.filter((player) => !isInjured(player, scene.date));
export const injured = (scene: EventScene) => scene.squad.filter((player) => isInjured(player, scene.date));
export const pickFrom = <T>(scene: EventScene, items: readonly T[]): T | undefined => items[Math.floor(scene.random() * items.length)];
export const playerCast = (player: SimPlayer | undefined): Cast | null => (player ? { playerId: player.id } : null);
export const byStrength = (players: readonly SimPlayer[]) => [...players].sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
export const finance = (scene: EventScene) => scene.state.finances[scene.clubId];
export const wageBill = (scene: EventScene) => scene.squad.reduce((sum, player) => sum + player.wage, 0);
export const wageOf = (scene: EventScene, cast: Cast) => (cast.playerId ? (scene.state.players[cast.playerId]?.wage ?? 0) : 0);
export const round = (money: number) => Math.round(money / 10_000) * 10_000;
export const board = (scene: EventScene) => scene.state.boards[scene.clubId];
export const mood = (scene: EventScene) => clubMood(scene.state, scene.clubId);
/** The month of the scene's day, 1 to 12. */
export const monthOf = (scene: EventScene) => Number(scene.date.slice(5, 7));
export const isWindow = (scene: EventScene) => isWindowOpen(scene.state, scene.date);
export const isForeign = (player: SimPlayer) => player.nationalities.length > 0 && !player.nationalities.includes("Brazil");
/** The squad's eleven strongest, fit or not: the regulars. */
export const regulars = (scene: EventScene) => byStrength(scene.squad).slice(0, 11);
/** The squad beyond its sixteen strongest: the ones who barely play. */
export const fringe = (scene: EventScene) => byStrength(scene.squad).slice(16);

/** The club's match today, if it played. */
export function playedToday(scene: EventScene): Fixture | undefined {
  return scene.played.find((f) => f.result && (f.homeId === scene.clubId || f.awayId === scene.clubId));
}

/** Goals for minus against in the club's match today; null without one. */
export function marginToday(scene: EventScene): number | null {
  const fixture = playedToday(scene);
  if (!fixture?.result) return null;
  const { homeGoals, awayGoals } = fixture.result;
  return fixture.homeId === scene.clubId ? homeGoals - awayGoals : awayGoals - homeGoals;
}

/** The club's next match after the scene's day, if one is booked. */
export function nextMatch(scene: EventScene): Fixture | undefined {
  // The day's scenes ask for many clubs: each fixtures list is read once per day for all of them.
  let known = nextMatchesOf.get(scene.state.fixtures);
  if (known?.date !== scene.date) {
    const byClub = new Map<string, Fixture>();
    for (const fixture of scene.state.fixtures) {
      if (fixture.result || fixture.date <= scene.date) continue;
      for (const clubId of [fixture.homeId, fixture.awayId]) {
        const next = byClub.get(clubId);
        if (!next || fixture.date < next.date) byClub.set(clubId, fixture);
      }
    }
    nextMatchesOf.set(scene.state.fixtures, (known = { date: scene.date, byClub }));
  }
  return known.byClub.get(scene.clubId);
}

const nextMatchesOf = new WeakMap<readonly Fixture[], { date: string; byClub: ReadonlyMap<string, Fixture> }>();

/** Whether the club plays within `days` days. */
export const playsWithin = (scene: EventScene, days: number) => {
  const next = nextMatch(scene);
  return !!next && next.date <= addDays(scene.date, days);
};

/** Points of the club's last games, newest last. */
export const recentPoints = (scene: EventScene) => finance(scene)?.recentPoints ?? [];
export const lastGames = (scene: EventScene, count: number) => recentPoints(scene).slice(-count);
export const isRun = (scene: EventScene, count: number, points: number) => lastGames(scene, count).length === count && lastGames(scene, count).every((p) => p === points);
/** Games without a win among the last `count`, when there were that many. */
export const winless = (scene: EventScene, count: number) => lastGames(scene, count).length === count && lastGames(scene, count).every((p) => p < 3);

/** Where the club stands in its league: the board's latest position, its table and games under the coach. */
export function standing(scene: EventScene) {
  const own = board(scene);
  return own ? { position: own.position, tableSize: own.tableSize, games: own.games, target: own.targetPosition } : null;
}
/** Fighting for the title: in the top two, with most of the league played. guess: from the 20th game on. */
export const isTitleRace = (scene: EventScene) => {
  const own = standing(scene);
  return !!own && own.games >= 20 && own.position <= 2;
};
/** In the drop zone, the bottom four, from the 8th game on. */
export const isRelegationFight = (scene: EventScene) => {
  const own = standing(scene);
  return !!own && own.games >= 8 && own.position > own.tableSize - 4;
};

/** The player's goals this season, every competition counted. */
export function seasonGoals(scene: EventScene, playerId: string): number {
  let goals = 0;
  for (const scorers of Object.values(scene.state.history.current.goals)) goals += scorers[playerId] ?? 0;
  return goals;
}

/** The squad's top scorer this season, with his goals; none before anyone scored. */
export function topScorer(scene: EventScene): { player: SimPlayer; goals: number } | null {
  let best: { player: SimPlayer; goals: number } | null = null;
  for (const player of scene.squad) {
    const goals = seasonGoals(scene, player.id);
    if (goals > 0 && (!best || goals > best.goals || (goals === best.goals && player.id < best.player.id))) best = { player, goals };
  }
  return best;
}

/** The club's sponsor on the front of the shirt, if it has one. */
export const masterSponsor = (scene: EventScene) => scene.state.sponsors?.[scene.clubId]?.contracts.find((deal) => deal.slot === "master");

/** The club's clássico rivals (rivalries/rivalryOf.ts), in id order. This is the bank's one seam to the rivalries. */
export const rivalIds = (scene: EventScene) => [...(rivalsOf(scene.state.clubs).get(scene.clubId) ?? [])].filter((id) => isClassico(scene.clubId, id)).sort();

/** The other club in the club's match today, if it played. */
export function opponentToday(scene: EventScene): string | undefined {
  const today = playedToday(scene);
  return today && (today.homeId === scene.clubId ? today.awayId : today.homeId);
}

/** Whether the club played one of its rivals today. */
export function playedRivalToday(scene: EventScene): boolean {
  const opponent = opponentToday(scene);
  return !!opponent && rivalIds(scene).includes(opponent);
}

/** The rival the club plays next, within a week; none when its next match is not a derby. */
export function rivalNext(scene: EventScene): string | undefined {
  const next = nextMatch(scene);
  const opponent = next && (next.homeId === scene.clubId ? next.awayId : next.homeId);
  return next && opponent && next.date <= addDays(scene.date, 7) && rivalIds(scene).includes(opponent) ? opponent : undefined;
}

// guess: a squad whose chemistry is this low fights twice as often after a defeat.
export const LOW_CHEMISTRY = 40;

// guess: every five points of heat between two clubs (rivalryKey) make their rivalry events one weight more
// likely, up to two weights: a feud makes a provocation likelier, never the only thing a club hears about.
const HEAT_PER_WEIGHT = 5;
const HEAT_WEIGHT_MOST = 2;

/** How much the heat the event's rivalry built up adds to its odds. */
export function heatOf(scene: EventScene, cast: Cast): number {
  const heat = cast.rivalId ? (eventMemoryOf(scene.state).rivalry[rivalryKey(scene.clubId, cast.rivalId)] ?? 0) : 0;
  return Math.min(HEAT_WEIGHT_MOST, heat / HEAT_PER_WEIGHT);
}

/** A rival of the club: the one it played today when it did, else one of its big derby rivals (any, if it has none that big). */
export function rivalCast(scene: EventScene): Cast | null {
  const every = rivalIds(scene);
  const big = every.filter((id) => (rivalryOf(scene.clubId, id)?.intensity ?? 0) >= BLOCK_FROM_INTENSITY);
  const opponent = opponentToday(scene);
  const rivalId = opponent && every.includes(opponent) ? opponent : pickFrom(scene, big.length ? big : every);
  return rivalId ? { rivalId } : null;
}

/** Whether the event already happened at the club within `days` days, of any of `typeIds`. */
export function happenedWithin(scene: EventScene, typeIds: readonly string[], days: number): boolean {
  const since = addDays(scene.date, -days);
  return eventMemoryOf(scene.state).log.some((record) => record.clubId === scene.clubId && record.date >= since && typeIds.includes(record.typeId));
}
