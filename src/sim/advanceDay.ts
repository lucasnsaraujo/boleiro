import type { State } from "../data/clubs.js";
import { simulateMatch, type Team } from "../engine/match.js";
import { paramsForDivision } from "../engine/paramsForDivision.js";
import { randomStream } from "../engine/random.js";
import { addDays } from "./dates.js";
import { endSeason } from "./endSeason.js";
import type { Competition, Fixture, GameState, SimPlayer } from "./gameState.js";
import type { LeagueOutcome } from "./leagueFormats.js";
import { openNextStage } from "./openNextStage.js";
import { aggregate } from "./tieResults.js";

export type DayDecisions = {
  lineup?: readonly string[];
};

export type DayEvent =
  | { type: "matchPlayed"; fixture: Fixture }
  | { type: "stageOpened"; competitionId: string; stage: number }
  | { type: "seasonEnded"; season: number; outcomes: Record<string, LeagueOutcome> };

const PENALTY_SHOOTOUT_HOME_WIN = 0.5; // guess: shootouts treated as a coin flip until a source on shootout odds is used

function squadsOf(state: GameState, decisions: DayDecisions): (clubId: string) => SimPlayer[] {
  const squads = new Map<string, SimPlayer[]>();
  for (const player of Object.values(state.players)) {
    const squad = squads.get(player.clubId) ?? [];
    squad.push(player);
    squads.set(player.clubId, squad);
  }
  if (decisions.lineup && state.coachClubId) {
    const lineup = decisions.lineup.map((id) => state.players[id]);
    const chosen = lineup.filter((player): player is SimPlayer => player?.clubId === state.coachClubId);
    if (chosen.length !== lineup.length) throw new Error(`lineup has players who are not at ${state.coachClubId}`);
    squads.set(state.coachClubId, chosen);
  }
  return (clubId) => squads.get(clubId) ?? [];
}

function isDecidingLeg(fixture: Fixture, competitions: Record<string, Competition>): boolean {
  const stage = competitions[fixture.competitionId]?.stages[fixture.stage];
  return fixture.tie !== undefined && stage?.kind === "knockout" && stage.dates.at(-1) === fixture.date;
}

export function advanceDay(state: GameState, decisions: DayDecisions): { state: GameState; events: DayEvent[] } {
  const random = randomStream(state.rngState);
  const events: DayEvent[] = [];
  const squad = squadsOf(state, decisions);
  const team = (clubId: string): Team => ({ name: state.clubs[clubId]?.shortName ?? clubId, players: squad(clubId) });

  let fixtures = state.fixtures.map((fixture) => {
    if (fixture.date !== state.date || fixture.result) return fixture;
    const competition = state.competitions[fixture.competitionId];
    if (!competition) throw new Error(`fixture ${fixture.id} has no competition ${fixture.competitionId}`);
    const score = simulateMatch(team(fixture.homeId), team(fixture.awayId), random.next, paramsForDivision(competition.division));
    let played: Fixture = { ...fixture, result: score };
    if (isDecidingLeg(fixture, state.competitions)) {
      const legs = [...state.fixtures.filter((f) => f.competitionId === fixture.competitionId && f.stage === fixture.stage && f.tie === fixture.tie && f.id !== fixture.id), played];
      if (aggregate(fixture.homeId, legs) === aggregate(fixture.awayId, legs)) {
        const penaltyWinnerId = random.next() < PENALTY_SHOOTOUT_HOME_WIN ? fixture.homeId : fixture.awayId;
        played = { ...played, result: { ...score, penaltyWinnerId } };
      }
    }
    events.push({ type: "matchPlayed", fixture: played });
    return played;
  });

  const clubStates: Record<string, State> = Object.fromEntries(Object.values(state.clubs).map((club) => [club.id, club.state]));
  const competitions = { ...state.competitions };
  for (const competition of Object.values(state.competitions)) {
    const own = fixtures.filter((f) => f.competitionId === competition.id);
    const current = competition.stages.length - 1;
    const stageDone = own.filter((f) => f.stage === current).every((f) => f.result !== null);
    if (!stageDone || competition.stages.length >= competition.stageDates.length) continue;
    const opened = openNextStage(competition, own, clubStates);
    competitions[competition.id] = opened.competition;
    fixtures = [...fixtures, ...opened.fixtures];
    events.push({ type: "stageOpened", competitionId: competition.id, stage: current + 1 });
  }

  const next: GameState = { ...state, date: addDays(state.date, 1), fixtures, competitions, rngState: random.state() };
  if (next.date.slice(0, 4) === String(state.season)) return { state: next, events };
  const ended = endSeason(next);
  events.push({ type: "seasonEnded", season: state.season, outcomes: ended.outcomes });
  return { state: ended.state, events };
}
