import type { Club } from "@boleiro/data/clubs";
import { keyedSeed, randomStream } from "../../engine/random.js";
import { boardExpectations } from "../coach/boardExpectations.js";
import type { ClubFinance, Fixture, GameState, IsoDate, LeagueCompetition, SimPlayer } from "../gameState.js";
import { wagesForBill } from "../finances/openingFinances.js";
import { projectedRevenue } from "../finances/setBoardBudget.js";
import { emptyLedger } from "../finances/ledger.js";
import { tierOf } from "../finances/tierOf.js";
import { NEUTRAL_MOOD } from "../morale/clubMood.js";
import { openingProfile } from "../players/openingProfile.js";
import { squadsByClub, squadsOfGame } from "../players/squadsByClub.js";
import { openingLineups } from "../players/usualLineups.js";
import { stageFixtures } from "../stageFixtures.js";
import { openingContractUntil } from "../transfers/openingContractUntil.js";
import { clubsAbroad } from "./clubsAbroad.js";
import { leagueMatches, playLeagueDay } from "./resultOnlyLeague.js";
import { squadLevel } from "../coach/aiCoaches.js";
import type { Country, WorldClub } from "./world.js";

/** The result-only country a club plays in, with its id; null for a club of the full tier or of no country. */
export function countryOfWorldClub(state: Pick<GameState, "world">, clubId: string): { id: string; country: Country } | null {
  for (const [id, country] of Object.entries(state.world ?? {})) if (!country.isFullTier && clubId in country.clubs) return { id, country };
  return null;
}

/**
 * The Brazilian club whose books a club abroad takes when it joins the full tier, as newGame gives a
 * league abroad's clubs the accounts of the Série A club at their strength rank: its top level's clubs
 * go with Série A's, the levels below with Série B's, rank for rank by squad level and projected revenue.
 */
export function proxyClubOf(state: Pick<GameState, "clubs" | "finances" | "world">, clubId: string): string | null {
  const found = countryOfWorldClub(state, clubId);
  const level = found?.country.leagues.findIndex((league) => league.clubIds.includes(clubId)) ?? -1;
  if (!found || level < 0) return null;
  const members = found.country.leagues[level]?.clubIds ?? [];
  const strength = (id: string) => squadLevel(found.country.clubs[id]?.strengths ?? []);
  const ranked = [...members].sort((a, b) => strength(a) - strength(b) || a.localeCompare(b));
  const position = ranked.indexOf(clubId) / Math.max(1, ranked.length - 1);
  const division = level === 0 ? "A" : "B";
  const revenue = (id: string) => {
    const finance = state.finances[id];
    return finance ? projectedRevenue(finance) : 0;
  };
  const proxies = Object.values(state.clubs).filter((club) => club.division === division && !club.abroad).map((club) => club.id).sort((a, b) => revenue(a) - revenue(b) || a.localeCompare(b));
  return proxies[Math.round(position * (proxies.length - 1))] ?? null;
}

/** A club's opening books copied from its proxy's: its money lines and budget, none of its history. */
function booksFrom(proxy: ClubFinance): ClubFinance {
  const books: ClubFinance = { ...proxy, loans: 0, wagesOwed: 0, lateWageMonths: 0, recentPoints: [], month: { ...emptyLedger(), points: 0, games: 0 }, season: emptyLedger(), lastSeason: null, lastClosing: null };
  for (const key of ["stadiumWorks", "homeGates", "bankLoan"] as const) Reflect.deleteProperty(books, key);
  return books;
}

/** The country's result-only leagues as the full tier plays them, the season so far with them: a round robin each, in the order and on the days it had. */
function leaguesJoined(id: string, country: Country): { competitions: LeagueCompetition[]; fixtures: Fixture[] } {
  const competitions: LeagueCompetition[] = [];
  const fixtures: Fixture[] = [];
  country.leagues.forEach((league, index) => {
    const level = country.structure.levels[index];
    const stage = { kind: "groups" as const, groups: [league.clubIds], legs: league.legs, dates: league.dates };
    const matches = leagueMatches(league);
    const own = stageFixtures(league.id, 0, stage);
    if (own.length !== matches.length) throw new Error(`${league.id}: ${own.length} fixtures for ${matches.length} matches`);
    competitions.push({
      id: league.id,
      kind: "league",
      format: "round-robin",
      division: null,
      abroad: { country: id, level: index, name: level?.name ?? "", promoted: index > 0 ? (level?.promoted ?? 0) : 0, relegated: level?.relegated ?? 0 },
      season: league.season,
      clubIds: [...league.clubIds],
      stages: [stage],
      stageDates: [[...league.dates]],
      drawOrder: [...league.drawOrder],
      ...(league.legs === 1 ? { legs: 1 as const } : {}),
    });
    fixtures.push(...own.map((fixture, i) => ({ ...fixture, result: matches[i]?.result ?? null })));
  });
  return { competitions, fixtures };
}

/**
 * The country with its league rounds before `date` played result-only: a coach takes a job after the
 * day's full-tier matches but before the world plays its own, so the day he moves on is still to play.
 */
function playedBefore(country: Country, date: IsoDate): Country {
  const random = randomStream(country.rngState);
  const clubOf = (id: string): WorldClub => {
    const club = country.clubs[id];
    if (!club) throw new Error(`${country.structure.id}: no club ${id}`);
    return club;
  };
  const leagues = country.leagues.map((league) => league.dates.filter((day) => day < date).reduce((played, day) => playLeagueDay(played, day, clubOf, random.next), league));
  return leagues.every((league, i) => league === country.leagues[i]) ? country : { ...country, leagues, rngState: random.state() };
}

/**
 * A result-only country brought into the full tier mid-season, when a human coach takes one of its
 * clubs: its clubs and squads (their ages from their years of birth), each club with the books and
 * wage bill of its Brazilian proxy (proxyClubOf), a board, a usual lineup and a neutral mood; its
 * leagues played on as round robins with the results so far (a league's real format comes with its
 * next season); its coaches into the full tier's. Its cup stays result-only, as at a new game.
 */
export function joinFullTier(state: GameState, id: string): GameState {
  const found = state.world?.[id];
  if (!found || found.isFullTier) return state;
  const country = playedBefore(found, state.date);
  const levels = country.leagues.map((league) => league.clubIds.flatMap((clubId) => country.clubs[clubId] ?? []));
  const { clubs, players } = clubsAbroad({ structure: country.structure, levels }, state.season);
  const random = randomStream(keyedSeed(state.seed, `join-${id}-${state.date}`)).next;
  const counts = new Map<string, number>();
  const squad: Omit<SimPlayer, "wage">[] = players.map((player) => {
    const index = counts.get(player.clubId) ?? 0;
    counts.set(player.clubId, index + 1);
    const club = clubs.find((c) => c.id === player.clubId);
    const { clubId, name, group, strength } = player;
    return { id: `${clubId}-p${index}`, clubId, name, group, strength, contractUntil: openingContractUntil(tierOf(club ?? { division: null }), state.season, random), ...openingProfile(player, state.date, random) };
  });
  const finances: Record<string, ClubFinance> = { ...state.finances };
  const wages = new Map<string, number>();
  const brazil = squadsOfGame(state);
  for (const club of clubs) {
    const proxy = proxyClubOf(state, club.id);
    const books = proxy ? state.finances[proxy] : undefined;
    if (!proxy || !books) throw new Error(`${club.id}: no Brazilian club to keep its books`);
    finances[club.id] = booksFrom(books);
    const bill = (brazil.get(proxy) ?? []).reduce((sum, player) => sum + player.wage, 0);
    for (const [playerId, wage] of wagesForBill(squad.filter((player) => player.clubId === club.id), bill)) wages.set(playerId, wage);
  }
  const joined: Record<string, SimPlayer> = Object.fromEntries(squad.map((player) => [player.id, { ...player, wage: wages.get(player.id) ?? 0 }]));
  const clubIds = clubs.map((club) => club.id);
  const { competitions, fixtures } = leaguesJoined(id, country);
  const { coaching, ...rest } = country;
  const coaches = state.coaches && coaching ? { ...state.coaches, coaches: { ...state.coaches.coaches, ...coaching.coaches }, openJobs: { ...state.coaches.openJobs, ...coaching.openJobs } } : state.coaches;
  const next: GameState = {
    ...state,
    clubs: { ...state.clubs, ...Object.fromEntries(clubs.map((club): [string, Club] => [club.id, club])) },
    players: { ...state.players, ...joined },
    finances,
    mood: { ...state.mood, ...Object.fromEntries(clubIds.map((clubId) => [clubId, NEUTRAL_MOOD])) },
    usualLineups: { ...state.usualLineups, ...openingLineups(clubIds, squadsByClub(joined), [], () => undefined) },
    competitions: { ...state.competitions, ...Object.fromEntries(competitions.map((c) => [c.id, c])) },
    fixtures: [...state.fixtures, ...fixtures],
    world: { ...state.world, [id]: { ...rest, leagues: [], isFullTier: true } },
    ...(coaches ? { coaches } : {}),
  };
  const { boards } = boardExpectations(next);
  return { ...next, boards: { ...state.boards, ...Object.fromEntries(clubIds.flatMap((clubId) => (boards[clubId] ? [[clubId, boards[clubId]]] : []))) } };
}
