import type { Club, State } from "../data/clubs.js";
import type { Division } from "../data/players.js";
import { randomStream } from "../engine/random.js";
import { driftWagesToCap } from "./finances/driftWagesToCap.js";
import { renewFinances } from "./finances/renewFinances.js";
import type { Qualification } from "./copaDoBrasilEntrants.js";
import type { GameState, LeagueCompetition } from "./gameState.js";
import { LEAGUE_FORMATS, type LeagueOutcome } from "./leagueFormats.js";
import { serieDQualifiers } from "./serieDQualifiers.js";
import { standings } from "./standings.js";
import { cupEntriesOf, startSeason } from "./startSeason.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";

// Série D 2026 has 96 clubs (CBF, https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro-serie-d/a/cbf-publica-documentos-tecnicos-da-nova-serie-d).
const SERIE_D_SIZE = 96;

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
  const a = outcomeOf(state, "A");
  const b = outcomeOf(state, "B");
  const c = outcomeOf(state, "C");
  const d = outcomeOf(state, "D");
  const moves = new Map<string, Division | null>();
  for (const id of a.relegatedIds) moves.set(id, "B");
  for (const id of b.promotedIds) moves.set(id, "A");
  for (const id of b.relegatedIds) moves.set(id, "C");
  for (const id of c.promotedIds) moves.set(id, "B");
  for (const id of c.relegatedIds) moves.set(id, "D");
  for (const id of d.promotedIds) moves.set(id, "C");
  for (const id of d.relegatedIds) moves.set(id, null);

  const divisionOf = (club: Club) => (moves.has(club.id) ? (moves.get(club.id) ?? null) : club.division);
  const nextDivision = new Map(Object.values(state.clubs).map((club) => [club.id, divisionOf(club)]));
  const stayingInD = [...nextDivision.values()].filter((division) => division === "D").length;
  const qualification = qualificationOf(state, b, c, d);
  const outsideNationalLeagues = (id: string) => nextDivision.get(id) === null;
  for (const id of serieDQualifiers(qualification.statePlacings, outsideNationalLeagues, SERIE_D_SIZE - stayingInD)) nextDivision.set(id, "D");

  const clubs: Record<string, Club> = Object.fromEntries(
    Object.values(state.clubs).map((club) => [club.id, { ...club, division: nextDivision.get(club.id) ?? null }]),
  );
  const season = state.season + 1;
  const random = randomStream(state.rngState);
  const { calendar, competitions, fixtures } = startSeason(season, clubs, random.next, qualification);
  const outcomes = Object.fromEntries(
    Object.values(state.competitions).flatMap((competition) =>
      competition.kind === "league" ? [[competition.id, { A: a, B: b, C: c, D: d }[competition.division]]] : [],
    ),
  );
  const finances = renewFinances(state, clubs, fixtures, cupEntriesOf(competitions), { A: a, B: b, C: c, D: d });
  const players = driftWagesToCap(state.players, finances);
  return {
    state: { ...state, season, clubs, players, calendar, competitions, fixtures, finances, rngState: random.state() },
    outcomes,
  };
}
