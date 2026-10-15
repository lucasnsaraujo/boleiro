import type { State } from "@boleiro/data/clubs";
import { randomStream } from "../../engine/random.js";
import type { DayEvent, DayResult, WaitingDecisions } from "../advanceDay.js";
import { isHumanClub, waitingCoachesOf, type WaitingCoach } from "../coach/humanCoaches.js";
import { coachCareerDay } from "../coach/coachCareerDay.js";
import { seasonEndField } from "../continental/continentalField.js";
import { openContinentalCups } from "../continental/openContinentalCups.js";
import { payContinentalPrizes } from "../continental/payContinentalPrizes.js";
import { playEuropeDay } from "../continental/uefaCups.js";
import { startCoachSeason } from "../coach/startCoachSeason.js";
import { buildStadiums } from "../stadium/stadiumWorks.js";
import { copyRecord } from "../copyRecord.js";
import { addDays } from "../dates.js";
import { countCards, type Booking } from "../discipline/drawCards.js";
import { endSeason } from "../endSeason.js";
import { closeMonth } from "../finances/closeMonth.js";
import { payCopaPrizes } from "../finances/payCopaPrizes.js";
import { payTitleBonuses } from "../finances/payTitleBonuses.js";
import { recordMatchFinances } from "../finances/recordMatchFinances.js";
import { dropCoachFriendlies, playFriendlies } from "../friendlies/friendlies.js";
import { releaseTicketPrice } from "../finances/setTicketPrice.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import type { Tactics } from "../coach/tactics.js";
import { closeSeasonHistory } from "../history/closeSeasonHistory.js";
import { recordStrengths } from "../history/recordStrengths.js";
import { recordDayEvents } from "../history/recordDayEvents.js";
import { recordMatches } from "../history/recordMatches.js";
import { clubMood } from "../morale/clubMood.js";
import { reactToDay } from "../morale/reactToDay.js";
import { openNextStage } from "../openNextStage.js";
import { developPlayers } from "../players/developPlayers.js";
import { isShootoutDue, settleShootout, shootoutSeed, shootoutWinnerOf } from "../settleShootout.js";
import { runTransferDay } from "../transfers/runTransferDay.js";
import { endWorldSeason, playWorldDay } from "../world/resultOnlyWorld.js";
import { coachOutcome } from "./coachOutcome.js";
import type { CoachMatch, DayInProgress, LiveDay, MatchOutcome } from "./liveDay.js";
import { onPitchAt, whoPlayed } from "./aiSubstitutions.js";
import { FULL_TIME, scorersFor, type MatchEvent } from "./matchTimeline.js";

function fixturesByCompetition(fixtures: readonly Fixture[]): Map<string, Fixture[]> {
  const byCompetition = new Map<string, Fixture[]>();
  for (const fixture of fixtures) {
    const own = byCompetition.get(fixture.competitionId);
    if (own) own.push(fixture);
    else byCompetition.set(fixture.competitionId, [fixture]);
  }
  return byCompetition;
}

/** Who played for each side and for how long, from the starters and the substitutions. */
function playedBy(coachMatch: CoachMatch, events: readonly MatchEvent[], homeId: string, awayId: string) {
  const benches = [...coachMatch.bench, ...(coachMatch.opponentBench ?? [])];
  const home = whoPlayed(coachMatch.starters.home, benches, events, homeId);
  const away = whoPlayed(coachMatch.starters.away, benches, events, awayId);
  return { home: home.players, away: away.players, minutes: new Map([...home.minutes, ...away.minutes]) };
}

/**
 * The winner of a shootout that is due but missing from the timeline: a live day saved before
 * shootouts were kicked on it. Played from the coach's match stream, as that build settled it.
 */
function shootoutOfOldSave(state: GameState, coachMatch: CoachMatch, played: Fixture, events: readonly MatchEvent[], random: () => number): string | undefined {
  if (!isShootoutDue(state, played)) return undefined;
  const benches = [...coachMatch.bench, ...(coachMatch.opponentBench ?? [])];
  const side = (clubId: string, starters: readonly SimPlayer[]) => ({ clubId, onPitch: onPitchAt(starters, benches, events, clubId, FULL_TIME + 1), morale: clubMood(state, clubId).squad });
  const strength = (p: SimPlayer) => coachMatch.strengths[p.id] ?? p.strength;
  const settled = settleShootout(played, shootoutSeed(random), side(played.homeId, coachMatch.starters.home), side(played.awayId, coachMatch.starters.away), strength);
  return settled.fixture.result?.penaltyWinnerId;
}

/** A human coach's match as its timeline ended after the changes, recorded on its own stream. */
function redrawnOutcome(state: GameState, coachMatch: CoachMatch, events: readonly MatchEvent[]): MatchOutcome {
  const fixture = state.fixtures.find((f) => f.id === coachMatch.fixtureId);
  const competition = fixture && state.competitions[fixture.competitionId];
  if (!fixture || !competition) throw new Error(`coach's match ${coachMatch.fixtureId} is not in today's fixtures`);
  const random = randomStream(coachMatch.rngState);
  const goals = (clubId: string) => events.flatMap((e) => (e.type === "goal" && e.clubId === clubId ? [e.playerId] : []));
  const bookings: Booking[] = events.flatMap((e) => (e.type === "card" ? [{ playerId: e.playerId, clubId: e.clubId, card: e.card, minute: e.minute }] : []));
  const score = { homeGoals: goals(fixture.homeId).length, awayGoals: goals(fixture.awayId).length, cards: countCards(bookings, fixture.homeId) };
  const penaltyWinnerId = shootoutWinnerOf(events, fixture.homeId, fixture.awayId) ?? shootoutOfOldSave(state, coachMatch, { ...fixture, result: score }, events, random.next);
  const played = { ...fixture, result: penaltyWinnerId ? { ...score, penaltyWinnerId } : score };
  const { home, away, minutes } = playedBy(coachMatch, events, fixture.homeId, fixture.awayId);
  const injuries = new Map(events.flatMap((e) => (e.type === "injury" ? [[e.playerId, e.days] as const] : [])));
  const scorers = { home: scorersFor(events, fixture.homeId), away: scorersFor(events, fixture.awayId) };
  const match = { played, context: coachMatch.context, awayTravelKm: coachMatch.awayTravelKm, lineups: { home, away }, minutes, bookings, injuries, scorers };
  return coachOutcome(state, competition, match, random.next);
}

/** The day's other matches with the human coaches' ones added where they stand in the fixture list. */
function withCoachMatches(live: LiveDay, open: readonly CoachMatch[]): DayInProgress {
  const { state, rest } = live;
  let day: DayInProgress = { ...rest, events: [] };
  let eventsIndex = 0;
  // Matches recorded at the same place in the day's events go in fixture order.
  const place = new Map(rest.fixtures.map((fixture, index) => [fixture.id, index]));
  const inOrder = [...open].sort((a, b) => a.eventsIndex - b.eventsIndex || (place.get(a.fixtureId) ?? 0) - (place.get(b.fixtureId) ?? 0));
  for (const coachMatch of inOrder) {
    const events = live.matches.find((m) => m.fixtureId === coachMatch.fixtureId)?.events ?? [];
    const outcome = coachMatch.isChanged ? redrawnOutcome(state, coachMatch, events) : coachMatch.kickOff;
    const { competitionId } = outcome.fixture;
    day = {
      fixtures: day.fixtures.map((f) => (f.id === outcome.fixture.id ? outcome.fixture : f)),
      events: [...day.events, ...rest.events.slice(eventsIndex, coachMatch.eventsIndex), ...outcome.events],
      players: [...day.players, ...outcome.players],
      discipline: { ...day.discipline, [competitionId]: { ...day.discipline[competitionId], ...outcome.discipline } },
      sheets: { ...day.sheets, [outcome.fixture.id]: outcome.sheet },
      rngState: rest.rngState,
    };
    eventsIndex = coachMatch.eventsIndex;
  }
  return { ...day, events: [...day.events, ...rest.events.slice(eventsIndex)] };
}

/** Every human coach's open match of a live day: the seated coach's and the waiting coaches'. */
function openMatchesOf(live: LiveDay): CoachMatch[] {
  return [...(live.coachMatch ? [live.coachMatch] : []), ...(live.waitingMatches ?? [])];
}

/** A coach's tactics as he left them in his open match, when he changed anything in it. */
function liveTacticsOf(live: LiveDay, clubId: string): Tactics | undefined {
  for (const open of openMatchesOf(live)) {
    if (!open.isChanged) continue;
    if (open.clubId === clubId) return open.tactics;
    const match = live.matches.find((m) => m.fixtureId === open.fixtureId);
    if (open.rivalTactics && (match?.homeId === clubId || match?.awayId === clubId)) return open.rivalTactics;
  }
  return undefined;
}

/**
 * Blows the final whistle on a live day and runs the rest of it: next stages, the history, money,
 * moods, the coach's career, the season's end and the transfer market. With no live changes this is
 * exactly advanceDay.
 */
export function finishMatchDay(live: LiveDay): DayResult {
  const { state, decisions } = live;
  const open = openMatchesOf(live);
  const day = open.length ? withCoachMatches(live, open) : live.rest;
  const random = randomStream(day.rngState);
  const events: DayEvent[] = [...day.events];
  let { fixtures } = day;

  const clubStates: Record<string, State> = Object.fromEntries(Object.values(state.clubs).map((club) => [club.id, club.state]));
  const competitions = { ...state.competitions };
  const byCompetition = fixturesByCompetition(fixtures);
  for (const competition of Object.values(state.competitions)) {
    const own = byCompetition.get(competition.id) ?? [];
    const current = competition.stages.length - 1;
    const stageDone = own.filter((f) => f.stage === current).every((f) => f.result !== null);
    if (!stageDone || competition.stages.length >= competition.stageDates.length) continue;
    const opened = openNextStage(competition, own, clubStates, { competitions, fixtures });
    competitions[competition.id] = opened.competition;
    fixtures = [...fixtures, ...opened.fixtures];
    events.push({ type: "stageOpened", competitionId: competition.id, stage: current + 1 });
  }

  // A continental guest's players belong to the result-only tier, so their match load is not kept.
  const ownPlayers = day.players.filter((player) => player.id in state.players);
  const players = ownPlayers.length ? copyRecord(state.players) : state.players;
  for (const player of ownPlayers) players[player.id] = player;
  const tactics = live.coachMatch?.tactics ?? decisions.tactics ?? state.coach.tactics;
  const coach = tactics === state.coach.tactics ? state.coach : { ...state.coach, tactics };
  let next: GameState = { ...state, date: addDays(state.date, 1), fixtures, competitions, players, discipline: day.discipline, coach };
  if (state.waitingCoaches) next = { ...next, waitingCoaches: withWaitingTactics(state.waitingCoaches, decisions.waiting ?? [], (clubId) => liveTacticsOf(live, clubId)) };
  const played = events.flatMap((event) => (event.type === "matchPlayed" ? [event.fixture] : []));
  const bonuses = payTitleBonuses(next, recordMatches(next, played, day.sheets));
  next = bonuses.state;
  events.push(...bonuses.events);
  next = recordMatchFinances(next, played);
  const prizes = payCopaPrizes(next, played);
  next = prizes.state;
  events.push(...prizes.events);
  const continentalPrizes = payContinentalPrizes(next, played);
  next = continentalPrizes.state;
  events.push(...continentalPrizes.events);
  const friendlies = playFriendlies(next, state.date);
  next = friendlies.state;
  events.push(...friendlies.events);
  const closed = next.date.endsWith("-01") ? closeMonth(next, random.next) : { state: next, events: [] };
  events.push(...closed.events);
  const built = buildStadiums(closed.state, closed.state.date);
  events.push(...built.events);
  const reacted = reactToDay(built.state, played, closed.events, random.next);
  next = reacted.state;
  events.push(...reacted.events);
  const career = coachCareerDay(next, played, decisions.acceptOffer, random.next, (decisions.waiting ?? []).map((own) => own.acceptOffer));
  next = career.state;
  const waitingEvents: DayEvent[][] = career.waitingEvents;
  // Friendlies the coach booked for a club he no longer runs are called off with his move.
  if (state.coachClubId && next.coachClubId !== state.coachClubId) next = dropCoachFriendlies(next, state.coachClubId);
  const formerClubIds = leftClubIds(state, next);
  for (const clubId of formerClubIds) next = dropCoachFriendlies(next, clubId);
  events.push(...career.events);
  next = { ...next, rngState: random.state() };
  if (state.world) next = { ...next, world: playWorldDay(state.world, state.date) };
  if (next.europe && next.world) next = { ...next, europe: playEuropeDay(next.europe, next.world, state.date) };
  if (next.date.slice(0, 4) !== String(state.season)) {
    const continentalField = seasonEndField(next);
    const developed = developPlayers(closeSeasonHistory(next));
    const ended = endSeason(developed.state);
    const marked = { ...ended.state, history: recordStrengths(ended.state) };
    const coachRandom = randomStream(marked.rngState);
    const started = startCoachSeason(marked, Object.values(ended.outcomes), coachRandom.next);
    started.waitingEvents.forEach((own, index) => waitingEvents[index]?.push(...own));
    events.push({ type: "seasonEnded", season: state.season, outcomes: ended.outcomes }, ...developed.events, ...started.events);
    // Bans still pending when a competition ends lapse with it.
    const liveDiscipline = Object.fromEntries(Object.entries(started.state.discipline).filter(([id]) => id in started.state.competitions));
    next = { ...started.state, discipline: liveDiscipline, rngState: coachRandom.state() };
    if (next.world) next = { ...next, world: endWorldSeason(next.world, next.season) };
    next = openContinentalCups(next, continentalField);
  }
  const market = runTransferDay(next, decisions.requests ?? [], (decisions.waiting ?? []).map((own) => own.requests ?? []));
  events.push(...market.events);
  market.waitingEvents.forEach((own, index) => waitingEvents[index]?.push(...own));
  const released = leftClubIds(state, market.state).reduce(releaseTicketPrice, releaseTicketPrice(market.state, state.coachClubId));
  const recorded = recordDayEvents(released, events, state);
  return state.waitingCoaches ? { state: recorded, events, waitingEvents } : { state: recorded, events };
}

/** The waiting coaches with the tactics they last chose: in their match today, else on their turn. */
function withWaitingTactics(coaches: readonly WaitingCoach[], decisions: readonly WaitingDecisions[], liveTactics: (clubId: string) => Tactics | undefined): WaitingCoach[] {
  return coaches.map((waiting, index) => {
    const tactics = (waiting.clubId && liveTactics(waiting.clubId)) || decisions[index]?.tactics;
    return tactics ? { ...waiting, coach: { ...waiting.coach, tactics } } : waiting;
  });
}

/** The clubs waiting hot-seat coaches ran at `before` and no longer run at `after`. */
function leftClubIds(before: GameState, after: GameState): string[] {
  return waitingCoachesOf(before).flatMap((waiting, index) => {
    const now = waitingCoachesOf(after)[index];
    return waiting.clubId && now?.clubId !== waiting.clubId && !isHumanClub(after, waiting.clubId) ? [waiting.clubId] : [];
  });
}
