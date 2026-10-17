import { randomStream } from "../../engine/random.js";
import type { DayEvent } from "../advanceDay.js";
import type { GameState, IsoDate } from "../gameState.js";
import type { CoachStint } from "../history/history.js";
import type { Country } from "../world/world.js";
import { fullTierClubs, fullTierStatures, inventCoach, type AiCoach, type AiCoachStint, type Coaching, type CoachWorld, type Rookie, type SeasonPoints } from "./aiCoaches.js";
import { countryPoints, fullTierPoints, nationalPoints, type ClubSeasonPoints, type SeasonRuns, type UefaWinner } from "./rankingPoints.js";

/** A retired player of the full tier: his name, the club he retired at, his best strength and his age. */
export type RetiredPlayer = { name: string; clubId: string; peak: number; age: number };

/** The players who retired at this season's turn (`events`), with their best strength from `before`, the game as they last played. */
export function retiredPlayers(before: Pick<GameState, "players" | "history">, events: readonly DayEvent[]): RetiredPlayer[] {
  return events.flatMap((event) => {
    if (event.type !== "playerRetired") return [];
    const marks = before.history.strength[event.playerId] ?? [];
    const peak = Math.max(before.players[event.playerId]?.strength ?? 0, ...marks.map((mark) => mark.strength));
    return [{ name: event.name, clubId: event.clubId, peak, age: event.age }];
  });
}

// guess: a player who peaked at 76 or more (a Série A regular's 72 plus a margin) was a star.
const STAR_PEAK = 76;
// guess: a retired star starts coaching two to four seasons later.
const ROOKIE_WAIT = { min: 2, span: 3 };
// guess: his name is worth this much reputation on day one, more for the bigger stars and clubs.
const ROOKIE_REPUTATION = 30;
const ROOKIE_REPUTATION_PER_PEAK_POINT = 3;
const ROOKIE_REPUTATION_PER_STATURE = 1 / 4;
// guess: AI coaches retire at 72; one out of work retires earlier now and then.
const RETIREMENT_AGE = 72;
const IDLE_RETIREMENT_CHANCE = 0.12;

/** The ranking key of a human coach: his name in a hot-seat game, empty in a one-coach game. */
export const humanKey = (name: string | undefined): string => `human:${name ?? ""}`;

/** Days of `stint` inside the season, the year from 1 January to 31 December. */
function daysIn(stint: { from: IsoDate; until: IsoDate | null }, season: number): number {
  const start = Math.max(Date.parse(stint.from), Date.parse(`${season}-01-01`));
  const end = Math.min(stint.until === null ? Infinity : Date.parse(stint.until), Date.parse(`${season + 1}-01-01`));
  return Math.max(0, (end - start) / 86_400_000);
}

/** The clubs a coach ran in the season, each with the share of the year he ran it. */
function creditsOf(stints: readonly (AiCoachStint | CoachStint)[], season: number): [string, number][] {
  const yearDays = daysIn({ from: `${season}-01-01`, until: `${season + 1}-01-01` }, season);
  return stints.flatMap((stint): [string, number][] => {
    const days = daysIn(stint, season);
    return days > 0 ? [[stint.clubId, Math.round((1000 * days) / yearDays) / 1000]] : [];
  });
}

/** The coaching after the season: titles credited to the coaches in charge, each coach's share of his clubs' season, the old ones retired and their jobs open. */
function closeCoaching<T extends Coaching>(coaching: T, season: number, points: ClubSeasonPoints, titles: readonly [string, string][], date: IsoDate, nextSeason: number, random: () => number, humans: Record<string, [string, number][]> = {}): T {
  const coaches: Record<string, AiCoach> = { ...coaching.coaches };
  // The coach in charge on the season's last day wins its titles, even if his club let him go before the next.
  const lastDay = `${season}-12-31`;
  const byClub = new Map<string, AiCoach>();
  for (const coach of Object.values(coaching.coaches)) {
    for (const stint of coach.stints) if (stint.from <= lastDay && (stint.until === null || stint.until >= lastDay)) byClub.set(stint.clubId, coach);
  }
  for (const [competition, clubId] of titles) {
    const coach = byClub.get(clubId);
    if (coach) coaches[coach.id] = { ...coach, titles: [...(coaches[coach.id]?.titles ?? coach.titles), { season, competition, clubId }] };
  }
  const credits: SeasonPoints["credits"] = {};
  for (const coach of Object.values(coaches)) {
    const own = creditsOf(coach.stints, season);
    if (own.length) credits[coach.id] = own;
  }
  for (const [key, own] of Object.entries(humans)) if (own.length) credits[key] = own;
  const openJobs = { ...coaching.openJobs };
  for (const coach of Object.values(coaches)) {
    if (coach.retiredIn !== undefined) continue;
    const isOld = nextSeason - coach.born >= RETIREMENT_AGE;
    if (!isOld && (coach.clubId !== null || random() >= IDLE_RETIREMENT_CHANCE)) continue;
    if (coach.clubId) openJobs[coach.clubId] = date;
    const stints = coach.stints.map((stint) => (stint.until === null ? { ...stint, until: date, left: "retired" as const } : stint));
    coaches[coach.id] = { ...coach, clubId: null, stints, retiredIn: nextSeason };
  }
  return { ...coaching, coaches, openJobs, seasons: [...coaching.seasons, { season, ...points, credits }] };
}

/** A result-only country's coaches at Brazil's turn of the season: its seasons filed since last time ranked and credited. */
function closeCountry(country: Country, season: number, uefaWinners: readonly UefaWinner[], date: IsoDate, nextSeason: number): Country {
  const { coaching } = country;
  if (!coaching || country.isFullTier) return country;
  const stream = randomStream(coaching.rngState);
  const filed = country.seasons.slice(coaching.filed);
  const id = country.structure.id;
  const titles = filed.flatMap((record): [string, string][] => [
    ...(record.champions[0] ? [[`${id}-1`, record.champions[0]] as [string, string]] : []),
    ...(record.cup ? [[`${id}-cup`, record.cup.championId] as [string, string]] : []),
  ]);
  const closed = closeCoaching(coaching, season, countryPoints(country, coaching.filed, uefaWinners), titles, date, nextSeason, stream.next);
  return { ...country, coaching: { ...closed, filed: country.seasons.length, rngState: stream.state() } };
}

/**
 * The coaches' turn of the season (`season`, the one just played; `state` already in the next): every
 * club's ranking points and every coach's share of them filed, titles credited to the AI coaches in
 * charge, retired stars queued to start coaching a few seasons on and those due joining the full tier's
 * pool, old coaches retiring and their jobs opening. `runs` are the season as it ended (seasonRuns), read
 * before its fixtures went. Each result-only country files its own on its own stream.
 */
export function closeCoachSeason(state: GameState, season: number, runs: SeasonRuns, retired: readonly RetiredPlayer[]): GameState {
  const world = state.coaches;
  if (!world) return state;
  const stream = randomStream(world.rngState);
  const random = stream.next;
  const uefaWinners = state.europe?.winners.slice(world.uefaFiled ?? 0) ?? [];
  const clubs = fullTierClubs(state);
  const national = nationalPoints(state.history, season, runs.cups);
  const points = fullTierPoints(state.history, season, runs, uefaWinners, (clubId) => clubs.has(clubId));
  const titles = Object.entries(state.history.seasons.find((record) => record.season === season)?.champions ?? {});
  const humans = {
    [humanKey(state.coachName)]: creditsOf(state.history.coach.stints, season),
    ...Object.fromEntries((state.waitingCoaches ?? []).map((waiting) => [humanKey(waiting.name), creditsOf(waiting.record.stints, season)])),
  };
  let closed: CoachWorld = closeCoaching(world, season, points, titles, state.date, state.season, random, humans);

  const statures = fullTierStatures(state);
  const queued: Rookie[] = retired
    .filter((player) => player.peak >= STAR_PEAK)
    .map((player) => ({
      name: player.name,
      born: season - player.age,
      nationality: "Brazil",
      clubId: player.clubId,
      strength: player.peak,
      reputation: Math.min(100, ROOKIE_REPUTATION + ROOKIE_REPUTATION_PER_PEAK_POINT * (player.peak - STAR_PEAK) + ROOKIE_REPUTATION_PER_STATURE * (statures.get(player.clubId) ?? 0)),
      season: season + ROOKIE_WAIT.min + Math.floor(random() * ROOKIE_WAIT.span),
    }));
  const rookies = [...closed.rookies, ...queued];
  const coaches = { ...closed.coaches };
  let { nextId } = closed;
  for (const rookie of rookies.filter((r) => r.season <= state.season)) {
    const coach = inventCoach({ nextId }, "", clubs.get(rookie.clubId) ?? "br", rookie.reputation, state.season, null, null, random);
    coaches[coach.id] = { ...coach, name: rookie.name, born: rookie.born, nationality: rookie.nationality, formerPlayer: { clubId: rookie.clubId, strength: rookie.strength } };
    nextId += 1;
  }
  closed = {
    ...closed,
    nextId,
    coaches,
    rookies: rookies.filter((r) => r.season > state.season),
    national: [...closed.national, { season, clubs: national }],
    ...(state.europe ? { uefaFiled: state.europe.winners.length } : {}),
    rngState: stream.state(),
  };
  const countries = state.world && Object.fromEntries(Object.entries(state.world).map(([id, country]) => [id, closeCountry(country, season, uefaWinners, state.date, state.season)]));
  return { ...state, coaches: closed, ...(countries ? { world: countries } : {}) };
}
