import type { Club, State } from "@boleiro/data/clubs";
import { loadPack } from "@boleiro/data/dataPack";
import type { SquadPlayer } from "@boleiro/data/players";
import { advanceDay } from "../sim/advanceDay.js";
import { addDays } from "../sim/dates.js";
import type { GameState, LeagueCompetition, MatchResult } from "../sim/gameState.js";
import { newGame } from "../sim/newGame.js";
import { openNextStage } from "../sim/openNextStage.js";
import { leagueMatches } from "../sim/world/resultOnlyLeague.js";
import { playWorldDay, startCountry } from "../sim/world/resultOnlyWorld.js";
import type { World, WorldClub } from "../sim/world/world.js";

const LEAGUE_SIZE = 20;
const DIVISION_ORDER = ["A", "B", "C", "D"];
const SYNTHETIC = "synthetic-";
// The engine's calibration is held to these against real leagues (engine/calibration.test.ts), on the
// plain score draw result-only plays; result-only may not stray further from the full pipeline. With
// 36 leagues, two points is about 3.7 standard errors of the difference between the two modes.
const SHARE_TOLERANCE = 0.02;
const GOALS_TOLERANCE = 0.1;

type Tally = { matches: number; goals: number; goalsSquared: number; home: number; draw: number; away: number };

const emptyTally = (): Tally => ({ matches: 0, goals: 0, goalsSquared: 0, home: 0, draw: 0, away: 0 });

function count(tally: Tally, { homeGoals, awayGoals }: MatchResult): void {
  const goals = homeGoals + awayGoals;
  tally.matches++;
  tally.goals += goals;
  tally.goalsSquared += goals * goals;
  if (homeGoals > awayGoals) tally.home++;
  else if (homeGoals === awayGoals) tally.draw++;
  else tally.away++;
}

/** One metric in both modes, how far apart they may be, and how many standard errors of the difference they are. */
export type RateGap = { metric: string; full: number; resultOnly: number; tolerance: number; standardErrors: number };
export type RateComparison = { matches: { full: number; resultOnly: number }; gaps: RateGap[] };

/** Each metric of both modes, with how many standard errors of the difference lie between them. */
function gapsOf(full: Tally, resultOnly: Tally): RateGap[] {
  const share = (metric: string, of: (t: Tally) => number): RateGap => {
    const [p, q] = [of(full) / full.matches, of(resultOnly) / resultOnly.matches];
    const error = Math.sqrt((p * (1 - p)) / full.matches + (q * (1 - q)) / resultOnly.matches);
    return { metric, full: p, resultOnly: q, tolerance: SHARE_TOLERANCE, standardErrors: Math.abs(p - q) / error };
  };
  const mean = (t: Tally) => t.goals / t.matches;
  const variance = (t: Tally) => t.goalsSquared / t.matches - mean(t) ** 2;
  const goalsError = Math.sqrt(variance(full) / full.matches + variance(resultOnly) / resultOnly.matches);
  return [
    {
      metric: "goals per match",
      full: mean(full),
      resultOnly: mean(resultOnly),
      tolerance: GOALS_TOLERANCE,
      standardErrors: Math.abs(mean(full) - mean(resultOnly)) / goalsError,
    },
    share("home wins", (t) => t.home),
    share("draws", (t) => t.draw),
    share("away wins", (t) => t.away),
  ];
}

/** Clones of the real clubs, best divisions first, `leagueCount` leagues of twenty, each club with its source's squad. */
function clonesOf(clubs: readonly Club[], players: readonly SquadPlayer[], leagueCount: number) {
  const rank = (club: Club) => (club.division ? DIVISION_ORDER.indexOf(club.division) : DIVISION_ORDER.length);
  const ranked = [...clubs].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const squads = new Map<string, SquadPlayer[]>();
  for (const player of players) squads.set(player.clubId, [...(squads.get(player.clubId) ?? []), player]);
  const leagues: string[][] = [];
  const clones: Club[] = [];
  const clonePlayers: SquadPlayer[] = [];
  for (let i = 0; i < leagueCount * LEAGUE_SIZE; i++) {
    const source = ranked[i % ranked.length];
    if (!source) throw new Error("no clubs to clone");
    const id = `${source.id}~${Math.floor(i / ranked.length) + 1}`;
    clones.push({ ...source, id, division: null });
    clonePlayers.push(...(squads.get(source.id) ?? []).map((player) => ({ ...player, clubId: id, club: id, division: null })));
    (leagues[Math.floor(i / LEAGUE_SIZE)] ??= []).push(id);
  }
  return { leagues, clones, clonePlayers };
}

/** The game with the synthetic leagues added as Série A-format leagues on the Série A dates. */
function withFullLeagues(state: GameState, leagues: readonly string[][]): GameState {
  const clubStates: Record<string, State> = Object.fromEntries(Object.values(state.clubs).map((club) => [club.id, club.state]));
  const competitions = { ...state.competitions };
  const fixtures = [...state.fixtures];
  leagues.forEach((clubIds, i) => {
    const league: LeagueCompetition = {
      id: `${SYNTHETIC}${i}-${state.season}`,
      kind: "league",
      format: "serie-a",
      division: "A",
      season: state.season,
      clubIds,
      stages: [],
      stageDates: [state.calendar.leagueDates.A],
      drawOrder: clubIds,
    };
    const opened = openNextStage(league, [], clubStates);
    competitions[league.id] = opened.competition;
    fixtures.push(...opened.fixtures);
  });
  return { ...state, competitions, fixtures };
}

/** The same leagues as result-only countries of one level each, every club with its squad on day one. */
function resultOnlyWorld(state: GameState, leagues: readonly string[][]): World {
  const squads = new Map<string, WorldClub>(leagues.flat().map((id) => [id, { id, name: id, positions: "", strengths: [] }]));
  for (const player of Object.values(state.players)) {
    const club = squads.get(player.clubId);
    if (!club) continue;
    club.positions += player.group[0] ?? "";
    club.strengths.push(player.strength);
  }
  return Object.fromEntries(
    leagues.map((clubIds, i) => {
      const id = `${SYNTHETIC}${i}`;
      const structure = { id, levels: [{ name: id, legs: 2 as const, promoted: 0, relegated: 0 }], window: ["01-28", "12-02"] as [string, string], continental: [] };
      const levels = [clubIds.flatMap((clubId) => squads.get(clubId) ?? [])];
      return [id, startCountry(structure, levels, state.season, state.seed + i)];
    }),
  );
}

/**
 * Plays `leagueCount` synthetic twenty-club leagues of cloned clubs for a season twice: in the full
 * pipeline of a real game (lineups, fatigue, morale, cards, the market) and result-only, then compares
 * goals per match and home, draw and away rates. In the full run the clones, outside the national
 * leagues, also play their estaduais and may reach the Copa do Brasil, and the market can move their
 * players; only their synthetic league matches are counted, and the result-only squads stay as on day one.
 */
export function resultOnlyRates(seed: number, leagueCount: number): RateComparison {
  const pack = loadPack();
  const { leagues, clones, clonePlayers } = clonesOf(pack.clubs, pack.players, leagueCount);
  const start = newGame(seed, { ...pack, clubs: [...pack.clubs, ...clones], players: [...pack.players, ...clonePlayers], coachClubId: null });
  const lastDate = start.calendar.leagueDates.A.at(-1) ?? "";

  const full = emptyTally();
  let state = withFullLeagues(start, leagues);
  while (state.date <= lastDate) {
    const day = advanceDay(state, {});
    for (const event of day.events) {
      if (event.type === "matchPlayed" && event.fixture.competitionId.startsWith(SYNTHETIC) && event.fixture.result) count(full, event.fixture.result);
    }
    state = day.state;
  }

  const resultOnly = emptyTally();
  let world = resultOnlyWorld(start, leagues);
  for (let date = `${start.season}-01-01`; date <= `${start.season}-12-31`; date = addDays(date, 1)) world = playWorldDay(world, date);
  for (const country of Object.values(world)) {
    for (const match of country.leagues.flatMap(leagueMatches)) if (match.result) count(resultOnly, match.result);
  }
  return { matches: { full: full.matches, resultOnly: resultOnly.matches }, gaps: gapsOf(full, resultOnly) };
}
