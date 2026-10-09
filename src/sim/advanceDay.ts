import type { State } from "../data/clubs.js";
import { simulateMatch } from "../engine/match.js";
import { randomStream } from "../engine/random.js";
import { copyRecord } from "./copyRecord.js";
import { addDays } from "./dates.js";
import { coachCareerDay } from "./coach/coachCareerDay.js";
import type { CoachEvent } from "./coach/coachEvent.js";
import { startCoachSeason } from "./coach/startCoachSeason.js";
import { CARD_RATES, cardCompetitionOf } from "./discipline/cardRates.js";
import type { DisciplineEvent } from "./discipline/discipline.js";
import { countCards, drawCards, sendOffMinutes } from "./discipline/drawCards.js";
import { openDisciplineDay } from "./discipline/recordCards.js";
import { refuseSuspended } from "./discipline/suspendedPlayers.js";
import { endSeason } from "./endSeason.js";
import { closeSeasonHistory } from "./history/closeSeasonHistory.js";
import { recordDayEvents } from "./history/recordDayEvents.js";
import { recordMatches, type MatchLineups } from "./history/recordMatches.js";
import { closeMonth, type FinanceEvent } from "./finances/closeMonth.js";
import { payCopaPrizes, type PrizePaid } from "./finances/payCopaPrizes.js";
import { recordMatchFinances } from "./finances/recordMatchFinances.js";
import type { Competition, Fixture, GameState, SimPlayer } from "./gameState.js";
import type { LeagueOutcome } from "./leagueFormats.js";
import { openNextStage } from "./openNextStage.js";
import { developPlayers, type PlayerRetired, type YouthPromoted } from "./players/developPlayers.js";
import type { SupporterEvent } from "./morale/escalateSupporters.js";
import { clubMood } from "./morale/clubMood.js";
import { reactToDay } from "./morale/reactToDay.js";
import { withoutCrowd } from "./morale/withoutCrowd.js";
import { isInjured } from "./players/isInjured.js";
import { matchSetup } from "./players/matchSetup.js";
import { squadsByClub } from "./players/squadsByClub.js";
import { recordMatchLoad, type PlayerInjured } from "./players/recordMatchLoad.js";
import { paramsForCompetition } from "./paramsForCompetition.js";
import { aggregate } from "./tieResults.js";
import type { CoachRequest } from "./transfers/coachRequest.js";
import { runTransferDay } from "./transfers/runTransferDay.js";
import type { TransferEvent } from "./transfers/transferEvents.js";

export type DayDecisions = {
  lineup?: readonly string[];
  /** The club whose open job offer the coach accepts today. */
  acceptOffer?: string;
  /** Transfer requests to the board, decided at the start of the next day. */
  requests?: readonly CoachRequest[];
};

export type DayEvent =
  | { type: "matchPlayed"; fixture: Fixture }
  | { type: "stageOpened"; competitionId: string; stage: number }
  | { type: "seasonEnded"; season: number; outcomes: Record<string, LeagueOutcome> }
  | FinanceEvent
  | PlayerInjured
  | DisciplineEvent
  | PlayerRetired
  | YouthPromoted
  | PrizePaid
  | SupporterEvent
  | CoachEvent
  | TransferEvent;

const LINEUP_SIZE = 11;
const PENALTY_SHOOTOUT_HOME_WIN = 0.5; // guess: shootouts treated as a coin flip until a source on shootout odds is used

/** Club squads, indexed on first use: most days have no match and need none. */
function squadsOf(state: GameState): (clubId: string) => SimPlayer[] {
  let squads: Map<string, SimPlayer[]> | null = null;
  return (clubId) => {
    squads ??= squadsByClub(state.players);
    return squads.get(clubId) ?? [];
  };
}

function fixturesByCompetition(fixtures: readonly Fixture[]): Map<string, Fixture[]> {
  const byCompetition = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const own = byCompetition.get(fixture.competitionId);
    if (own) own.push(fixture);
    else byCompetition.set(fixture.competitionId, [fixture]);
  }
  return byCompetition;
}

function coachLineupOf(state: GameState, decisions: DayDecisions): SimPlayer[] | null {
  if (!decisions.lineup || !state.coachClubId) return null;
  const lineup = decisions.lineup.map((id) => state.players[id]);
  const chosen = lineup.filter((player): player is SimPlayer => player?.clubId === state.coachClubId);
  if (chosen.length !== lineup.length) throw new Error(`lineup has players who are not at ${state.coachClubId}`);
  const injured = chosen.filter((player) => isInjured(player, state.date));
  if (injured.length) throw new Error(`lineup has injured players: ${injured.map((p) => p.name).join(", ")}`);
  if (chosen.length !== LINEUP_SIZE || new Set(chosen).size !== LINEUP_SIZE) throw new Error(`lineup needs ${LINEUP_SIZE} different players`);
  if (chosen.filter((player) => player.group === "GK").length !== 1) throw new Error("lineup needs exactly one goalkeeper");
  return chosen;
}

function isDecidingLeg(fixture: Fixture, competitions: Record<string, Competition>): boolean {
  const stage = competitions[fixture.competitionId]?.stages[fixture.stage];
  return fixture.tie !== undefined && stage?.kind === "knockout" && stage.dates.at(-1) === fixture.date;
}

export function advanceDay(state: GameState, decisions: DayDecisions): { state: GameState; events: DayEvent[] } {
  const random = randomStream(state.rngState);
  const events: DayEvent[] = [];
  const squad = squadsOf(state);
  const coachLineup = coachLineupOf(state, decisions);
  const playedToday: SimPlayer[] = [];
  const cards = openDisciplineDay(state.discipline);
  const lineups: MatchLineups = {};

  let fixtures = state.fixtures.map((fixture) => {
    if (fixture.date !== state.date || fixture.result) return fixture;
    const competition = state.competitions[fixture.competitionId];
    if (!competition) throw new Error(`fixture ${fixture.id} has no competition ${fixture.competitionId}`);
    const suspended = cards.suspended(fixture.competitionId);
    if (state.coachClubId && [fixture.homeId, fixture.awayId].includes(state.coachClubId)) refuseSuspended(coachLineup ?? [], suspended);
    const setup = matchSetup(state, fixture, (clubId) => squad(clubId).filter((p) => !suspended.has(p.id)), coachLineup);
    const bookings = drawCards(setup.homeLineup, setup.awayLineup, CARD_RATES[cardCompetitionOf(competition)], random.next);
    const params = withoutCrowd(paramsForCompetition(competition), clubMood(state, fixture.homeId));
    const goals = simulateMatch(setup.home, setup.away, random.next, params, sendOffMinutes(bookings, fixture.homeId));
    const score = { ...goals, cards: countCards(bookings, fixture.homeId) };
    let played: Fixture = { ...fixture, result: score };
    if (isDecidingLeg(fixture, state.competitions)) {
      const legs = [...state.fixtures.filter((f) => f.competitionId === fixture.competitionId && f.stage === fixture.stage && f.tie === fixture.tie && f.id !== fixture.id), played];
      if (aggregate(fixture.homeId, legs) === aggregate(fixture.awayId, legs)) {
        const penaltyWinnerId = random.next() < PENALTY_SHOOTOUT_HOME_WIN ? fixture.homeId : fixture.awayId;
        played = { ...played, result: { ...score, penaltyWinnerId } };
      }
    }
    events.push({ type: "matchPlayed", fixture: played });
    lineups[played.id] = { home: setup.homeLineup, away: setup.awayLineup };
    const load = recordMatchLoad({ ...setup, result: score }, random.next);
    playedToday.push(...load.players);
    events.push(...load.events);
    events.push(...cards.record(competition, played, bookings, (id) => state.players[id]?.clubId, random.next));
    return played;
  });

  const clubStates: Record<string, State> = Object.fromEntries(Object.values(state.clubs).map((club) => [club.id, club.state]));
  const competitions = { ...state.competitions };
  const byCompetition = fixturesByCompetition(fixtures);
  for (const competition of Object.values(state.competitions)) {
    const own = byCompetition.get(competition.id) ?? [];
    const current = competition.stages.length - 1;
    const stageDone = own.filter((f) => f.stage === current).every((f) => f.result !== null);
    if (!stageDone || competition.stages.length >= competition.stageDates.length) continue;
    const opened = openNextStage(competition, own, clubStates);
    competitions[competition.id] = opened.competition;
    fixtures = [...fixtures, ...opened.fixtures];
    events.push({ type: "stageOpened", competitionId: competition.id, stage: current + 1 });
  }

  const players = playedToday.length ? copyRecord(state.players) : state.players;
  for (const player of playedToday) players[player.id] = player;
  let next: GameState = { ...state, date: addDays(state.date, 1), fixtures, competitions, players, discipline: cards.discipline() };
  const played = events.flatMap((event) => (event.type === "matchPlayed" ? [event.fixture] : []));
  next = recordMatches(next, played, lineups);
  for (const fixture of played) next = recordMatchFinances(next, fixture);
  const prizes = payCopaPrizes(next, played);
  next = prizes.state;
  events.push(...prizes.events);
  const closed = next.date.endsWith("-01") ? closeMonth(next, random.next) : { state: next, events: [] };
  events.push(...closed.events);
  const reacted = reactToDay(closed.state, played, closed.events, random.next);
  next = reacted.state;
  events.push(...reacted.events);
  const career = coachCareerDay(next, played, decisions.acceptOffer, random.next);
  next = career.state;
  events.push(...career.events);
  next = { ...next, rngState: random.state() };
  if (next.date.slice(0, 4) !== String(state.season)) {
    const developed = developPlayers(closeSeasonHistory(next));
    const ended = endSeason(developed.state);
    const coachRandom = randomStream(ended.state.rngState);
    const started = startCoachSeason(ended.state, Object.values(ended.outcomes), coachRandom.next);
    events.push({ type: "seasonEnded", season: state.season, outcomes: ended.outcomes }, ...developed.events, ...started.events);
    // Bans still pending when a competition ends lapse with it.
    const liveDiscipline = Object.fromEntries(Object.entries(started.state.discipline).filter(([id]) => id in started.state.competitions));
    next = { ...started.state, discipline: liveDiscipline, rngState: coachRandom.state() };
  }
  const market = runTransferDay(next, decisions.requests ?? []);
  events.push(...market.events);
  return { state: recordDayEvents(market.state, events, state), events };
}
