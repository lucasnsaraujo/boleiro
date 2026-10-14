import { CALIBRATED, pickLineup, simulateMatch, type PositionGroup, type Team } from "../../engine/match.js";
import { addDays, daysBetween } from "../dates.js";
import type { IsoDate, MatchResult } from "../gameState.js";
import { roundRobin, type Pairing } from "../roundRobin.js";
import { shuffle } from "../shuffle.js";
import { standings } from "../standings.js";
import type { ResultOnlyLeague, WorldClub } from "./world.js";

const BYE = "";
const UNPLAYED = "-";
const ZERO_GOALS = "0".charCodeAt(0);
const GROUP_OF: Record<string, PositionGroup> = { G: "GK", D: "DEF", M: "MID", A: "ATT" };
const STARTERS = 11;

/** A league's matches in results order, and where each round starts in them (one entry more than rounds). */
type Schedule = { pairs: Pairing[]; roundStarts: number[] };

// Keyed on the club order: a league keeps that array, and its legs, all season, while its results change daily.
const schedules = new WeakMap<readonly string[], Schedule>();
const teams = new WeakMap<WorldClub, Team>();

function scheduleOf(league: ResultOnlyLeague): Schedule {
  const known = schedules.get(league.clubIds);
  if (known) return known;
  const ids = league.clubIds.length % 2 ? [...league.clubIds, BYE] : league.clubIds;
  const pairs: Pairing[] = [];
  const roundStarts = [0];
  for (const round of roundRobin(ids, league.legs)) {
    pairs.push(...round.filter((pair) => !pair.includes(BYE)));
    roundStarts.push(pairs.length);
  }
  const schedule = { pairs, roundStarts };
  schedules.set(league.clubIds, schedule);
  return schedule;
}

/** The club's best eleven at full fitness, as the engine plays it; cached, since a result-only squad only changes between seasons. */
function teamOf(club: WorldClub): Team {
  const known = teams.get(club);
  if (known) return known;
  const players = club.strengths.map((strength, i) => {
    const group = GROUP_OF[club.positions[i] ?? ""];
    if (!group) throw new Error(`club ${club.id}: player ${i} has no position`);
    return { name: `${club.id}-${i}`, group, strength };
  });
  const team = { name: club.name, players: pickLineup(players) };
  teams.set(club, team);
  return team;
}

/** Throws unless the club has a position for each strength, eleven players and a keeper, as the score draw needs. */
export function checkSquad(club: WorldClub): void {
  const { id, positions, strengths } = club;
  if (positions.length !== strengths.length) throw new Error(`club ${id}: ${positions.length} positions for ${strengths.length} players`);
  if (strengths.length < STARTERS) throw new Error(`club ${id}: ${strengths.length} players, fewer than ${STARTERS}`);
  if (!positions.includes("G")) throw new Error(`club ${id}: no goalkeeper`);
  if ([...positions].some((letter) => !(letter in GROUP_OF))) throw new Error(`club ${id}: positions "${positions}" are not all G, D, M or A`);
}

/** `rounds` match days spread evenly over the window, its first and last days included. */
function leagueDates(season: number, [first, last]: [string, string], rounds: number): IsoDate[] {
  const start = `${season}-${first}`;
  const span = daysBetween(start, `${season}-${last}`);
  if (span < rounds - 1) throw new Error(`${rounds} rounds do not fit between ${start} and ${season}-${last}`);
  return Array.from({ length: rounds }, (_, i) => addDays(start, rounds > 1 ? Math.round((i * span) / (rounds - 1)) : 0));
}

/** A league's season with its fixture order and tie-break drawn, every match still to play. */
export function openLeague(
  id: string,
  season: number,
  clubIds: readonly string[],
  legs: 1 | 2,
  window: [string, string],
  random: () => number,
): ResultOnlyLeague {
  const order = shuffle(clubIds, random);
  const opened = { id, season, clubIds: order, legs, drawOrder: shuffle(order, random), dates: [], results: "" };
  const { pairs, roundStarts } = scheduleOf(opened);
  return { ...opened, dates: leagueDates(season, window, roundStarts.length - 1), results: UNPLAYED.repeat(2 * pairs.length) };
}

/** The league with today's round drawn by the engine's score draw, or the same league when it has no round today. */
export function playLeagueDay(league: ResultOnlyLeague, date: IsoDate, clubOf: (id: string) => WorldClub, random: () => number): ResultOnlyLeague {
  const round = league.dates.indexOf(date);
  const { pairs, roundStarts } = scheduleOf(league);
  const from = roundStarts[round] ?? 0;
  const to = roundStarts[round + 1] ?? 0;
  if (round < 0 || league.results[2 * from] !== UNPLAYED) return league;
  let played = "";
  for (const [homeId, awayId] of pairs.slice(from, to)) {
    // guess: until each league has its own fit, every result-only match plays at Série A's calibration.
    const { homeGoals, awayGoals } = simulateMatch(teamOf(clubOf(homeId)), teamOf(clubOf(awayId)), random, CALIBRATED);
    played += String.fromCharCode(ZERO_GOALS + homeGoals, ZERO_GOALS + awayGoals);
  }
  return { ...league, results: league.results.slice(0, 2 * from) + played + league.results.slice(2 * to) };
}

type LeagueMatch = { homeId: string; awayId: string; date: IsoDate; result: MatchResult | null };

/** Every match of the league in results order, with its score once played. */
export function leagueMatches(league: ResultOnlyLeague): LeagueMatch[] {
  const { pairs, roundStarts } = scheduleOf(league);
  return pairs.map(([homeId, awayId], i) => {
    const round = roundStarts.findIndex((start) => start > i) - 1;
    const isPlayed = league.results[2 * i] !== UNPLAYED;
    const result = isPlayed ? { homeGoals: league.results.charCodeAt(2 * i) - ZERO_GOALS, awayGoals: league.results.charCodeAt(2 * i + 1) - ZERO_GOALS } : null;
    return { homeId, awayId, date: league.dates[round] ?? "", result };
  });
}

/** The league's clubs in table order, best first, by the Brasileirão tie-breaks. */
export function leagueTable(league: ResultOnlyLeague): string[] {
  return standings(league.clubIds, leagueMatches(league), league.drawOrder).map((row) => row.clubId);
}
