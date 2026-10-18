import { STATES, type Club, type State } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import { randomStream } from "../engine/random.js";
import { driftWagesToCap } from "./finances/driftWagesToCap.js";
import { renewFinances } from "./finances/renewFinances.js";
import { nationalRanking, type Qualification } from "./copaDoBrasilEntrants.js";
import type { GameState, LeagueCompetition } from "./gameState.js";
import { finalOrderOf, LEAGUE_FORMATS, type LeagueOutcome } from "./leagueFormats.js";
import { serieDQualifiers } from "./serieDQualifiers.js";
import { standings } from "./standings.js";
import { startSeason } from "./startSeason.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";
import { BRAZIL } from "./world/brazil.js";
import { pyramidMoves } from "./world/pyramidMoves.js";
import { formatsOf } from "./formats.js";
import { fileFullTierSeason, mostRounds, seasonMoves } from "./world/resultOnlyWorld.js";
import { unifiedDatesOf } from "./seasonCalendar.js";
import type { Country } from "./world/world.js";
import { fullTierDaysOf, isFinished, turnsOnItsOwn } from "./world/turnSeasonsAbroad.js";
import { isCupAbroadCurrent } from "./continental/cupsAbroad.js";

function leagueOf(state: GameState, division: Division): LeagueCompetition {
  const competition = Object.values(state.competitions).find((c) => c.kind === "league" && c.division === division && c.season === state.season);
  if (competition?.kind !== "league") throw new Error(`no Série ${division} ${state.season}`);
  return competition;
}

const fixturesOf = (state: GameState, competitionId: string) => state.fixtures.filter((f) => f.competitionId === competitionId);

/**
 * Each state's final placings; with the Série C and D champions and two Série B clubs, they qualify clubs for next
 * season. guess: in a game without the estaduais each state's clubs line up by the national ranking instead.
 */
function qualificationOf(state: GameState, b: LeagueOutcome, c: LeagueOutcome, d: LeagueOutcome): Qualification {
  const statePlacings: Partial<Record<State, string[]>> = {};
  for (const competition of Object.values(state.competitions)) {
    if (competition.kind === "state") statePlacings[competition.state] = STATE_CHAMPIONSHIP.placings(competition, fixturesOf(state, competition.id));
  }
  if (state.playsStateChampionships === false) {
    const ranking = nationalRanking(Object.values(state.clubs));
    for (const uf of STATES) statePlacings[uf] = ranking.filter((id) => state.clubs[id]?.state === uf);
  }
  const serieB = leagueOf(state, "B");
  const bTable = standings(serieB.clubIds, fixturesOf(state, serieB.id), serieB.drawOrder).map((row) => row.clubId);
  // guess: the Copa do Nordeste and Copa Verde are not played, so their phase-3 places go to the best
  // Série B clubs that missed promotion.
  const bestUnpromoted = bTable.filter((id) => !b.promotedIds.includes(id)).slice(0, 2);
  return { statePlacings, phase3Ids: [c.championId, d.championId, ...bestUnpromoted] };
}

function outcomeOf(state: GameState, division: Division): LeagueOutcome {
  const competition = leagueOf(state, division);
  const fixtures = fixturesOf(state, competition.id);
  if (competition.stages.length < competition.stageDates.length || fixtures.some((f) => !f.result)) {
    throw new Error(`${competition.id} is not finished on ${state.date}`);
  }
  return LEAGUE_FORMATS[competition.format].outcome(competition, fixtures);
}

export function endSeason(state: GameState): { state: GameState; outcomes: Record<string, LeagueOutcome> } {
  const byDivision = new Map(BRAZIL.levels.map(({ division }) => [division, outcomeOf(state, division)]));
  const outcomeAt = (division: Division): LeagueOutcome => {
    const outcome = byDivision.get(division);
    if (!outcome) throw new Error(`Série ${division} is not one of Brazil's levels`);
    return outcome;
  };
  const divisions = BRAZIL.levels.map((level) => level.division);
  const moves = pyramidMoves(divisions, byDivision);
  const divisionOf = (club: Club) => (moves.has(club.id) ? (moves.get(club.id) ?? null) : club.division);
  const nextDivision = new Map(Object.values(state.clubs).map((club) => [club.id, divisionOf(club)]));
  const bottom = divisions.at(-1) ?? null;
  const stayingInBottom = [...nextDivision.values()].filter((division) => division === bottom).length;
  const qualification = qualificationOf(state, outcomeAt("B"), outcomeAt("C"), outcomeAt("D"));
  const outsideNationalLeagues = (id: string) => nextDivision.get(id) === null;
  for (const id of serieDQualifiers(qualification.statePlacings, outsideNationalLeagues, BRAZIL.bottomLevelSize - stayingInBottom)) nextDivision.set(id, bottom);

  const abroad = tablesAbroad(state);
  const levelAbroad = new Map(abroad.flatMap(({ country, tables }) => [...seasonMoves(country.structure, tables).moves]));
  const clubs: Record<string, Club> = Object.fromEntries(
    Object.values(state.clubs).map((club) => [club.id, { ...club, division: nextDivision.get(club.id) ?? null, ...movedAbroad(club, levelAbroad) }]),
  );
  const season = state.season + 1;
  const random = randomStream(state.rngState);
  const gridRounds = mostRounds(
    Object.values(state.world ?? {}).flatMap(({ structure, leagues, isFullTier }) =>
      isFullTier
        ? structure.levels.map((level, i) => ({ clubCount: Object.values(clubs).filter((club) => club.abroad?.country === structure.id && club.abroad.level === i).length, legs: level.legs, ...(level.format ? { format: level.format } : {}) }))
        : leagues.map((league) => ({ clubCount: league.clubIds.length, legs: league.legs })),
    ),
  );
  const opened = startSeason(season, clubs, random.next, qualification, state.playsStateChampionships !== false, state.economy.continentalStages !== undefined, formatsOf(state), gridRounds, abroad.map(({ country }) => country.structure), state.guests !== undefined, state.nations !== undefined);
  const { calendar } = opened;
  // A league abroad whose season crosses the new year plays on into Brazil's next, its games and table with it, and so do a human club's cups abroad still played.
  const crossing = Object.values(state.competitions).filter((c) => (c.kind === "league" && c.abroad && !isFinished(c, fixturesOf(state, c.id))) || (c.kind === "cupAbroad" && isCupAbroadCurrent(state, c)));
  const competitions = { ...opened.competitions, ...Object.fromEntries(crossing.map((c) => [c.id, c])) };
  const crossingIds = new Set(crossing.map((c) => c.id));
  const fixtures = crossing.length ? [...opened.fixtures, ...state.fixtures.filter((f) => crossingIds.has(f.competitionId))] : opened.fixtures;
  const outcomes = Object.fromEntries(
    Object.values(state.competitions).flatMap((competition) => {
      if (competition.kind !== "league" || crossingIds.has(competition.id)) return [];
      return [[competition.id, competition.division ? outcomeAt(competition.division) : LEAGUE_FORMATS[competition.format].outcome(competition, fixturesOf(state, competition.id))]];
    }),
  );
  const finances = renewFinances(state, clubs, competitions, fixtures, [...byDivision.values()]);
  const players = driftWagesToCap(state.players, finances);
  const unified = unifiedDatesOf(calendar);
  const world = abroad.length && state.world ? { ...state.world, ...Object.fromEntries(abroad.map(({ country, tables }) => [country.structure.id, fileFullTierSeason(country, tables, season, unified, fullTierDaysOf(country.structure.id, competitions, season, formatsOf(state)))])) } : state.world;
  return {
    state: { ...state, season, clubs, players, calendar, competitions, fixtures, finances, rngState: random.state(), ...(world ? { world } : {}) },
    outcomes,
  };
}

/** Each full-tier country abroad that turns its season with Brazil's, with its leagues' final tables, top level first. */
function tablesAbroad(state: GameState): { country: Country; tables: string[][] }[] {
  return Object.values(state.world ?? {}).flatMap((country) => {
    if (!country.isFullTier || turnsOnItsOwn(country)) return [];
    const tables = country.structure.levels.map((_, level) => {
      const league = Object.values(state.competitions).find((c) => c.kind === "league" && c.season === state.season && c.abroad?.country === country.structure.id && c.abroad.level === level);
      return league?.kind === "league" ? finalOrderOf(league, fixturesOf(state, league.id)) : [];
    });
    return [{ country, tables }];
  });
}

/** The club's next level abroad, when the season moved it. */
function movedAbroad(club: Club, levelAbroad: ReadonlyMap<string, number | null>): Pick<Club, "abroad"> | null {
  const level = levelAbroad.get(club.id);
  return club.abroad && level !== undefined && level !== null ? { abroad: { ...club.abroad, level } } : null;
}
