import type { Club } from "../data/clubs.js";
import type { Division } from "../data/players.js";
import { pickLineup } from "../engine/match.js";
import { randomStream } from "../engine/random.js";
import type { GameState, SimPlayer } from "./gameState.js";
import { LEAGUE_FORMATS, type LeagueOutcome } from "./leagueFormats.js";
import { startSeason } from "./startSeason.js";

// Série D 2026 has 96 clubs (CBF, https://www.cbf.com.br/futebol-brasileiro/noticias/campeonato-brasileiro-serie-d/a/cbf-publica-documentos-tecnicos-da-nova-serie-d).
const SERIE_D_SIZE = 96;

function outcomeOf(state: GameState, division: Division): LeagueOutcome {
  const competition = Object.values(state.competitions).find((c) => c.division === division && c.season === state.season);
  if (!competition) throw new Error(`no Série ${division} ${state.season}`);
  const fixtures = state.fixtures.filter((f) => f.competitionId === competition.id);
  if (competition.stages.length < competition.stageDates.length || fixtures.some((f) => !f.result)) {
    throw new Error(`${competition.id} is not finished on ${state.date}`);
  }
  return LEAGUE_FORMATS[competition.format].outcome(competition, fixtures);
}

const squadStrength = (squad: readonly SimPlayer[]) => {
  const lineup = pickLineup([...squad]);
  return lineup.reduce((sum, p) => sum + p.strength, 0) / Math.max(lineup.length, 1);
};

// Placeholder until #8: the state championships should decide who fills Série D. For now the
// strongest squads outside Série A–C take the free places.
function serieDNewcomers(state: GameState, taken: ReadonlySet<string>, count: number): string[] {
  const squads = new Map<string, SimPlayer[]>();
  for (const player of Object.values(state.players)) squads.set(player.clubId, [...(squads.get(player.clubId) ?? []), player]);
  return Object.keys(state.clubs)
    .filter((id) => !taken.has(id))
    .map((id) => ({ id, strength: squadStrength(squads.get(id) ?? []) }))
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    .slice(0, count)
    .map(({ id }) => id);
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
  const taken = new Set([...nextDivision].filter(([, division]) => division !== null).map(([id]) => id));
  const stayingInD = [...nextDivision.values()].filter((division) => division === "D").length;
  for (const id of serieDNewcomers(state, taken, SERIE_D_SIZE - stayingInD)) nextDivision.set(id, "D");

  const clubs: Record<string, Club> = Object.fromEntries(
    Object.values(state.clubs).map((club) => [club.id, { ...club, division: nextDivision.get(club.id) ?? null }]),
  );
  const season = state.season + 1;
  const random = randomStream(state.rngState);
  const { calendar, competitions, fixtures } = startSeason(season, clubs, random.next);
  const outcomes = Object.fromEntries(
    Object.values(state.competitions).map((competition) => [competition.id, { A: a, B: b, C: c, D: d }[competition.division]]),
  );
  return {
    state: { ...state, season, clubs, calendar, competitions, fixtures, rngState: random.state() },
    outcomes,
  };
}
