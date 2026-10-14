import type { Club, State } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import { randomStream } from "../engine/random.js";
import { driftWagesToCap } from "./finances/driftWagesToCap.js";
import { renewFinances } from "./finances/renewFinances.js";
import type { Qualification } from "./copaDoBrasilEntrants.js";
import type { GameState, LeagueCompetition } from "./gameState.js";
import { LEAGUE_FORMATS, type LeagueOutcome } from "./leagueFormats.js";
import { serieDQualifiers } from "./serieDQualifiers.js";
import { standings } from "./standings.js";
import { startSeason } from "./startSeason.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";
import { BRAZIL } from "./world/brazil.js";
import { pyramidMoves } from "./world/pyramidMoves.js";

function leagueOf(state: GameState, division: Division): LeagueCompetition {
  const competition = Object.values(state.competitions).find((c) => c.kind === "league" && c.division === division && c.season === state.season);
  if (competition?.kind !== "league") throw new Error(`no Série ${division} ${state.season}`);
  return competition;
}

const fixturesOf = (state: GameState, competitionId: string) => state.fixtures.filter((f) => f.competitionId === competitionId);

/** Each state's final placings; with the Série C and D champions and two Série B clubs, they qualify clubs for next season. */
function qualificationOf(state: GameState, b: LeagueOutcome, c: LeagueOutcome, d: LeagueOutcome): Qualification {
  const statePlacings: Partial<Record<State, string[]>> = {};
  for (const competition of Object.values(state.competitions)) {
    if (competition.kind === "state") statePlacings[competition.state] = STATE_CHAMPIONSHIP.placings(competition, fixturesOf(state, competition.id));
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

  const clubs: Record<string, Club> = Object.fromEntries(
    Object.values(state.clubs).map((club) => [club.id, { ...club, division: nextDivision.get(club.id) ?? null }]),
  );
  const season = state.season + 1;
  const random = randomStream(state.rngState);
  const { calendar, competitions, fixtures } = startSeason(season, clubs, random.next, qualification);
  const outcomes = Object.fromEntries(
    Object.values(state.competitions).flatMap((competition) => (competition.kind === "league" ? [[competition.id, outcomeAt(competition.division)]] : [])),
  );
  const finances = renewFinances(state, clubs, competitions, fixtures, [...byDivision.values()]);
  const players = driftWagesToCap(state.players, finances);
  return {
    state: { ...state, season, clubs, players, calendar, competitions, fixtures, finances, rngState: random.state() },
    outcomes,
  };
}
