import type { Fixture, GameState, MatchResult, NationalFullTierCompetition, Stage } from "../gameState.js";
import type { NationalCompetition, NationalMatch, NationalResult } from "./nations.js";

const NATIONAL = "national:";

/** The full tier's fixture of a national match, and its competition's, by the national ids. */
export const nationalFixtureId = (matchId: string): string => `${NATIONAL}${matchId}`;
const fullTierIdOf = (competitionId: string): string => `${NATIONAL}${competitionId}`;

/** The national match a full-tier fixture plays, by its id; null for any other fixture. */
export const nationalMatchIdOf = (fixtureId: string): string | null => (fixtureId.startsWith(NATIONAL) ? fixtureId.slice(NATIONAL.length) : null);

/** The national teams the human coaches run. */
export function humanNationalTeamIds(state: Pick<GameState, "nations">): string[] {
  const job = state.nations?.job;
  return job ? [job.teamId] : [];
}

/** A stage's key in a competition's full-tier copy: a one-match knockout round has a stage a day, so each tie's day is its stage's last; a round played over two legs or as a table has one. */
function stageKeyOf(source: NationalCompetition, match: NationalMatch): string {
  const legs = source.knockout.find((round) => round.name === match.round)?.legs;
  return legs === 1 ? `${match.round}@${match.date}` : match.round;
}

/** A national competition's full-tier copy with no match in it yet. */
function emptyCopy(source: NationalCompetition, season: number): NationalFullTierCompetition {
  return {
    id: fullTierIdOf(source.id),
    kind: "national",
    nationalId: source.id,
    nationalKind: source.kind,
    name: source.name,
    ...(source.confederation ? { confederation: source.confederation } : {}),
    season,
    clubIds: [],
    stages: [],
    stageDates: [],
    drawOrder: [],
    rounds: [],
    neutral: [],
  };
}

const stageKeysOf = (copy: NationalFullTierCompetition): string[] => copy.stages.map((stage, i) => (stage.kind === "knockout" && stage.dates.length === 1 ? `${copy.rounds[i]}@${stage.dates[0]}` : (copy.rounds[i] ?? "")));

/** A competition's full-tier copy with `match` in it, and the match as its fixture. */
function withMatch(copy: NationalFullTierCompetition, source: NationalCompetition, match: NationalMatch): { copy: NationalFullTierCompetition; fixture: Fixture } {
  const key = stageKeyOf(source, match);
  let index = stageKeysOf(copy).indexOf(key);
  const stages = [...copy.stages];
  const rounds = [...copy.rounds];
  const neutral = [...copy.neutral];
  if (index < 0) {
    index = stages.length;
    const isTable = match.round === "group" || match.round === "friendly";
    stages.push(isTable ? { kind: "groups", groups: [], legs: 1, dates: [] } : { kind: "knockout", ties: [], dates: [] });
    rounds.push(match.round);
    neutral.push(match.isNeutral === true);
  }
  const stage = stages[index] as Stage;
  const dates = stage.dates.includes(match.date) ? stage.dates : [...stage.dates, match.date].sort();
  const base = { id: nationalFixtureId(match.id), competitionId: copy.id, stage: index, date: match.date, homeId: match.homeId, awayId: match.awayId, result: null };
  let fixture: Fixture;
  if (stage.kind === "groups") {
    // A group holds its whole draw, so its table reads right; friendlies sit in groups of the teams met.
    const groups = stage.groups.map((teams) => [...teams]);
    let group = groups.findIndex((teams) => teams.includes(match.homeId));
    if (group < 0) {
      group = groups.length;
      groups.push([...(match.group ? (source.groups[match.group] ?? []) : [])]);
    }
    const own = groups[group] ?? [];
    for (const team of [match.homeId, match.awayId]) if (!own.includes(team)) own.push(team);
    stages[index] = { ...stage, groups, dates };
    fixture = { ...base, group };
  } else {
    const ties = [...stage.ties];
    let tie = ties.findIndex(([a, b]) => (a === match.homeId && b === match.awayId) || (a === match.awayId && b === match.homeId));
    if (tie < 0) {
      tie = ties.length;
      ties.push([match.homeId, match.awayId]);
    }
    stages[index] = { ...stage, ties, dates };
    fixture = { ...base, tie };
  }
  const clubIds = [...copy.clubIds, ...[match.homeId, match.awayId].filter((id) => !copy.clubIds.includes(id))];
  return { copy: { ...copy, clubIds, stages, stageDates: stages.map((s) => s.dates), rounds, neutral }, fixture };
}

/**
 * The game with the national matches of the human coaches' teams among the full tier's fixtures, so they are
 * played live and open match pages: each match of theirs not played yet, and the other matches of its
 * competition on its day, under the competition's full-tier copy. A match already among the fixtures keeps what
 * the full tier recorded. The same game when no human coach runs a national team, or nothing is new.
 */
export function syncNationalFixtures(state: GameState): GameState {
  const nations = state.nations;
  const teams = new Set(humanNationalTeamIds(state));
  if (!nations || !teams.size) return state;
  const days = new Set(nations.matches.filter((m) => !m.result && m.date >= state.date && (teams.has(m.homeId) || teams.has(m.awayId))).map((m) => `${m.competitionId}|${m.date}`));
  if (!days.size) return state;
  const known = new Set(state.fixtures.map((f) => f.id));
  const due = nations.matches.filter((m) => !m.result && days.has(`${m.competitionId}|${m.date}`) && !known.has(nationalFixtureId(m.id))).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!due.length) return state;
  const competitions = { ...state.competitions };
  const added: Fixture[] = [];
  for (const match of due) {
    const source = nations.competitions[match.competitionId];
    if (!source) continue;
    const existing = competitions[fullTierIdOf(source.id)];
    const copy = existing?.kind === "national" ? existing : emptyCopy(source, state.season);
    const next = withMatch(copy, source, match);
    competitions[copy.id] = next.copy;
    added.push(next.fixture);
  }
  return { ...state, competitions, fixtures: [...state.fixtures, ...added] };
}

/** Today's national matches the full tier played, by national match id, as the national competitions keep a result. */
export function playedNationalOf(played: readonly Fixture[]): ReadonlyMap<string, NationalResult> {
  const results = new Map<string, NationalResult>();
  for (const fixture of played) {
    const id = nationalMatchIdOf(fixture.id);
    if (!id || !fixture.result) continue;
    results.set(id, nationalResultOf(fixture.result));
  }
  return results;
}

function nationalResultOf(result: MatchResult): NationalResult {
  return {
    home: result.homeGoals,
    away: result.awayGoals,
    ...(result.penaltyWinnerId ? { penaltyWinnerId: result.penaltyWinnerId } : {}),
    ...(result.isAfterExtraTime ? { isAfterExtraTime: true as const } : {}),
  };
}

const playsToday = (state: Pick<GameState, "fixtures" | "date">, id: string) => state.fixtures.some((f) => f.date === state.date && !f.result && (f.homeId === id || f.awayId === id));

/** The national team of the coach in the seat when it plays in the full tier today; null otherwise. */
export function nationalTeamToday(state: Pick<GameState, "nations" | "fixtures" | "date">): string | null {
  const teamId = state.nations?.job?.teamId;
  return teamId && playsToday(state, teamId) ? teamId : null;
}

/**
 * The side the coach in the seat runs in today's matches, which the day's lineup, tactics and talk are for: his
 * club when it plays today, else his national team when it does (his assistant takes the national team on a day
 * both play), else his club.
 */
export function seatedSideToday(state: Pick<GameState, "nations" | "fixtures" | "date" | "coachClubId">): string | null {
  const teamId = nationalTeamToday(state);
  if (!teamId || (state.coachClubId !== null && playsToday(state, state.coachClubId))) return state.coachClubId;
  return teamId;
}
