import type { State } from "@boleiro/data/clubs";
import { randomStream } from "../../engine/random.js";
import type { DayEvent, DayResult, WaitingDecisions } from "../advanceDay.js";
import { isHumanClub, waitingCoachesOf, type WaitingCoach } from "../coach/humanCoaches.js";
import { coachCareerDay } from "../coach/coachCareerDay.js";
import { moveAiCoaches, moveWorldCoaches } from "../coach/moveAiCoaches.js";
import { keepDecidingMatches } from "../album/keepDecidingMatches.js";
import { recordFormerPlayers } from "../coach/assistant.js";
import { assistantPromotions } from "../youth/assistantPromotions.js";
import { closeCoachSeason, retiredPlayers } from "../coach/closeCoachSeason.js";
import { seasonRuns } from "../coach/rankingPoints.js";
import { seasonEndField } from "../continental/continentalField.js";
import { openContinentalCups } from "../continental/openContinentalCups.js";
import { payContinentalPrizes } from "../continental/payContinentalPrizes.js";
import { latestChampionsLeagueWinner, playEuropeDay } from "../continental/uefaCups.js";
import { startCoachSeason } from "../coach/startCoachSeason.js";
import { buildStadiums } from "../stadium/stadiumWorks.js";
import { addDays } from "../dates.js";
import { countCards, type Booking } from "../discipline/drawCards.js";
import { endSeason } from "../endSeason.js";
import type { LeagueOutcome } from "../leagueFormats.js";
import { runSponsorDay } from "../sponsors/sponsorDeals.js";
import { coolRivalries } from "../events/eventMemory.js";
import { findEggs } from "../eggs/findEggs.js";
import { recordNews } from "../events/recordNews.js";
import { runEvents } from "../events/runEvents.js";
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
import { recordFeats } from "../history/recordFeats.js";
import { withTalkMorale } from "./teamTalk.js";
import { recordRatings } from "../history/recordRatings.js";
import { recordElevens } from "../chemistry/recordElevens.js";
import { clubMood } from "../morale/clubMood.js";
import { reactToDay } from "../morale/reactToDay.js";
import { matchOfficials } from "../referees/matchOfficials.js";
import { talkedAboutCalls, type RefereeCallEvent } from "../referees/refereeCalls.js";
import { isNextStageReady, openNextStage } from "../openNextStage.js";
import { developPlayers } from "../players/developPlayers.js";
import { withReplacedPlayers } from "../players/squadsByClub.js";
import { copinhaDate, playCopinha } from "../youth/copinha.js";
import { fillShortSquads } from "../youth/fillShortSquads.js";
import { turnOverAcademies } from "../youth/turnOverAcademies.js";
import { isShootoutDue, settleShootout, shootoutSeed, shootoutWinnerOf } from "../settleShootout.js";
import { runTransferDay } from "../transfers/runTransferDay.js";
import { endWorldSeason, playWorldDay } from "../world/resultOnlyWorld.js";
import { turnSeasonsAbroad } from "../world/turnSeasonsAbroad.js";
import { playedAbroadOf, recordTitlesAbroad, syncCupsAbroad } from "../continental/cupsAbroad.js";
import { formatsOf } from "../formats.js";
import { unifiedDatesOf } from "../seasonCalendar.js";
import { coachOutcome } from "./coachOutcome.js";
import type { CoachMatch, DayInProgress, LiveDay, MatchOutcome } from "./liveDay.js";
import { onPitchAt, whoPlayed } from "./aiSubstitutions.js";
import { tieBreakOf } from "../tieBreaks.js";
import { FULL_TIME, hasExtraTimeIn, matchEndOf, scorersFor, type MatchEvent } from "./matchTimeline.js";
import { recordCoachMeetings } from "../rivalries/coachRivalries.js";
import { nationsDay } from "../nations/nationsDay.js";
import { nationalTeamToday, playedNationalOf, syncNationalFixtures } from "../nations/nationalFixtures.js";
import { isNationalTeam } from "../nations/nationalSquad.js";
import { runMoments } from "../moments/runMoments.js";

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
  const end = matchEndOf(events);
  const home = whoPlayed(coachMatch.starters.home, benches, events, homeId, end);
  const away = whoPlayed(coachMatch.starters.away, benches, events, awayId, end);
  return { home: home.players, away: away.players, minutes: new Map([...home.minutes, ...away.minutes]) };
}

/**
 * The winner of a shootout that is due but missing from the timeline: a live day saved before
 * shootouts were kicked on it. Played from the coach's match stream, as that build settled it.
 */
function shootoutOfOldSave(state: GameState, coachMatch: CoachMatch, played: Fixture, events: readonly MatchEvent[], random: () => number): string | undefined {
  const competition = state.competitions[played.competitionId];
  if (!isShootoutDue(state, played) || (competition && tieBreakOf(competition, played.stage) === "betterSeed")) return undefined;
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
  const score = {
    homeGoals: goals(fixture.homeId).length,
    awayGoals: goals(fixture.awayId).length,
    ...(hasExtraTimeIn(events) ? { isAfterExtraTime: true as const } : {}),
    cards: countCards(bookings, fixture.homeId),
  };
  const penaltyWinnerId = shootoutWinnerOf(events, fixture.homeId, fixture.awayId) ?? shootoutOfOldSave(state, coachMatch, { ...fixture, result: score }, events, random.next);
  const played = { ...fixture, result: penaltyWinnerId ? { ...score, penaltyWinnerId } : score };
  const { home, away, minutes } = playedBy(coachMatch, events, fixture.homeId, fixture.awayId);
  // A match saved before injury kinds calls its injuries knocks.
  const injuries = new Map(events.flatMap((e) => (e.type === "injury" ? [[e.playerId, { days: e.days, kind: e.kind ?? "knock", isRecurrence: e.isRecurrence === true }] as const] : [])));
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

/** The day's VAR changes and wrong calls that stood, match by match, for the papers and the dressing rooms. */
function refereeCallsOf(live: LiveDay): RefereeCallEvent[] {
  const talked = live.matches.flatMap((match) => talkedAboutCalls(match.events).map((call) => ({ fixtureId: match.fixtureId, call })));
  if (!talked.length) return [];
  const today = new Map(live.state.fixtures.filter((f) => f.date === live.state.date).map((f) => [f.id, f]));
  return talked.flatMap(({ fixtureId, call }): RefereeCallEvent[] => {
    const fixture = today.get(fixtureId);
    const competition = fixture && live.state.competitions[fixture.competitionId];
    if (!fixture || !competition) return [];
    const referee = matchOfficials(live.state.seed, competition, fixture).referee?.name ?? null;
    return [{ type: "refereeCall", fixtureId, competitionId: competition.id, referee, call }];
  });
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
  // A player hurt playing for his national team is hurt at his club.
  const events: DayEvent[] = [...day.events.map((e) => (e.type === "playerInjured" && isNationalTeam(state, e.clubId) ? { ...e, clubId: state.players[e.playerId]?.clubId ?? e.clubId } : e)), ...refereeCallsOf(live)];
  let { fixtures } = day;

  // Only a day that ends a stage needs the clubs' states.
  let clubStates: Record<string, State> | undefined;
  const competitions = { ...state.competitions };
  const byCompetition = fixturesByCompetition(fixtures);
  const championsLeague = latestChampionsLeagueWinner(state.europe);
  for (const competition of Object.values(state.competitions)) {
    if (competition.stages.length >= competition.stageDates.length) continue;
    const own = byCompetition.get(competition.id) ?? [];
    const current = competition.stages.length - 1;
    const stageDone = own.filter((f) => f.stage === current).every((f) => f.result !== null);
    const season = { competitions, fixtures, championsLeague };
    if (!stageDone || !isNextStageReady(competition, season)) continue;
    clubStates ??= Object.fromEntries(Object.values(state.clubs).flatMap((club) => (club.state ? [[club.id, club.state]] : [])));
    const opened = openNextStage(competition, own, clubStates, season);
    competitions[competition.id] = opened.competition;
    fixtures = [...fixtures, ...opened.fixtures];
    events.push({ type: "stageOpened", competitionId: competition.id, stage: current + 1 });
  }

  // A continental guest's players and a national team's from abroad belong to the result-only tier, so their match load is not kept;
  // the game's players who played for their national team are back at their clubs.
  const ownPlayers = day.players.flatMap((player) => {
    const clubId = state.players[player.id]?.clubId;
    return clubId === undefined ? [] : [player.clubId === clubId ? player : { ...player, clubId }];
  });
  const players = ownPlayers.length ? withReplacedPlayers(state.players, ownPlayers) : state.players;
  const nationalId = nationalTeamToday(state);
  const nationalMatch = nationalId ? open.find((m) => m.clubId === nationalId) : undefined;
  const clubMatch = live.coachMatch?.clubId === undefined ? live.coachMatch : null;
  const tactics = clubMatch?.tactics ?? (nationalMatch && nationalMatch === live.coachMatch ? undefined : decisions.tactics) ?? state.coach.tactics;
  const coach = tactics === state.coach.tactics ? state.coach : { ...state.coach, tactics };
  const nationalTactics = nationalMatch && (nationalMatch.isChanged || nationalMatch === live.coachMatch) ? nationalMatch.tactics : undefined;
  const job = state.nations?.job;
  const nations = state.nations && job && nationalTactics ? { ...state.nations, job: { ...job, tactics: nationalTactics } } : state.nations;
  let next: GameState = { ...state, date: addDays(state.date, 1), fixtures, competitions, players, discipline: day.discipline, coach, ...(nations ? { nations } : {}) };
  if (state.waitingCoaches) next = { ...next, waitingCoaches: withWaitingTactics(state.waitingCoaches, decisions.waiting ?? [], (clubId) => liveTacticsOf(live, clubId)) };
  const played = events.flatMap((event) => (event.type === "matchPlayed" ? [event.fixture] : []));
  const elevens = recordElevens(next, played, day.sheets, state);
  const feats = recordFeats(keepDecidingMatches(recordMatches(elevens, played, day.sheets), played, day.sheets, live.matches), elevens, played, day.sheets);
  events.push(...feats.events);
  const bonuses = payTitleBonuses(next, recordRatings(feats.state, state, played, day.sheets, live.matches));
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
  next = withTalkMorale(reacted.state, live);
  events.push(...reacted.events);
  const career = coachCareerDay(next, played, decisions.acceptOffer, random.next, (decisions.waiting ?? []).map((own) => own.acceptOffer));
  const moved = moveAiCoaches(career.state, state, career.vacancies, state.date);
  next = moved.state;
  const waitingEvents: DayEvent[][] = career.waitingEvents;
  // Friendlies the coach booked for a club he no longer runs are called off with his move.
  if (state.coachClubId && next.coachClubId !== state.coachClubId) next = dropCoachFriendlies(next, state.coachClubId);
  const formerClubIds = leftClubIds(state, next);
  for (const clubId of formerClubIds) next = dropCoachFriendlies(next, clubId);
  events.push(...career.events, ...moved.events);
  next = { ...next, rngState: random.state() };
  if (state.date === copinhaDate(state.season)) {
    const copinha = playCopinha(next);
    next = copinha.state;
    events.push(...copinha.events);
  }
  // The world as the coaches' day left it: a coach who took a club abroad brought its country into the full tier.
  // A human club's cup matches abroad were played in the full tier today: the result-only cups take their scores.
  const playedAbroad = playedAbroadOf(state, played);
  if (next.world) {
    const beforeTurn: GameState = { ...next, world: moveWorldCoaches(playWorldDay(next.world, state.date, playedAbroad), state.date) };
    const turned = turnSeasonsAbroad(beforeTurn, state.date);
    // A coach whose contract ended at his country's turn leaves a job the AI coaches fill.
    next = turned.events.length ? moveAiCoaches(turned.state, beforeTurn, [], state.date).state : turned.state;
    events.push(...turned.events);
  }
  if (next.europe && next.world) next = { ...next, europe: playEuropeDay(next.europe, next.world, state.date, formatsOf(state), playedAbroad) };
  const titled = recordTitlesAbroad(state, next);
  if (titled !== next) {
    const abroadBonuses = payTitleBonuses(next, titled);
    next = abroadBonuses.state;
    events.push(...abroadBonuses.events);
  }
  if (next.nations) {
    const national = nationsDay(next, state.date, playedNationalOf(played));
    next = national.state;
    events.push(...national.events);
  }
  let seasonOutcomes: Record<string, LeagueOutcome> = {};
  if (next.date.slice(0, 4) !== String(state.season)) {
    const continentalField = seasonEndField(next);
    const runs = seasonRuns(next);
    const filed = closeSeasonHistory(next);
    const awards = filed.history.seasons.at(-1)?.awards;
    const academies = turnOverAcademies(filed);
    const developed = developPlayers(academies.state);
    const retired = retiredPlayers(academies.state, developed.events);
    const ended = endSeason(developed.state);
    const marked = { ...ended.state, history: recordStrengths(ended.state) };
    const coachRandom = randomStream(marked.rngState);
    const begun = startCoachSeason(marked, Object.values(ended.outcomes), coachRandom.next);
    // The clubs that change coach before the season, and any whose human coach's contract ended, open their jobs on the coaches' own stream.
    const started = { ...begun, state: moveAiCoaches(begun.state, marked, begun.vacancies, state.date).state };
    started.waitingEvents.forEach((own, index) => waitingEvents[index]?.push(...own));
    events.push({ type: "seasonEnded", season: state.season, outcomes: ended.outcomes }, ...(awards ? [{ type: "seasonAwarded" as const, season: state.season, awards }] : []), ...academies.events, ...developed.events, ...started.events);
    // Bans still pending when a competition ends lapse with it.
    const liveDiscipline = Object.fromEntries(Object.entries(started.state.discipline).filter(([id]) => id in started.state.competitions));
    next = { ...started.state, discipline: liveDiscipline, rngState: coachRandom.state() };
    if (next.world) next = { ...next, world: endWorldSeason(next.world, next.season, unifiedDatesOf(next.calendar)) };
    next = closeCoachSeason(openContinentalCups(next, continentalField), state.season, runs, retired);
    next = coolRivalries(recordFormerPlayers(next, academies.state, developed.events));
    seasonOutcomes = ended.outcomes;
  }
  next = syncNationalFixtures(syncCupsAbroad(next));
  const sponsorDay = runSponsorDay(state, next, seasonOutcomes);
  next = sponsorDay.state;
  events.push(...sponsorDay.events);
  const market = runTransferDay(next, decisions.requests ?? [], (decisions.waiting ?? []).map((own) => own.requests ?? []));
  events.push(...market.events);
  market.waitingEvents.forEach((own, index) => waitingEvents[index]?.push(...own));
  const promoted = assistantPromotions(market.state);
  events.push(...promoted.events);
  promoted.waitingEvents.forEach((own, index) => waitingEvents[index]?.push(...own));
  // A day the market moved nobody leaves the players as they were.
  const filled = promoted.state.players !== next.players ? fillShortSquads(promoted.state) : { state: promoted.state, events: [] };
  events.push(...filled.events);
  const released = leftClubIds(state, filled.state).reduce(releaseTicketPrice, releaseTicketPrice(filled.state, state.coachClubId));
  const happened = runEvents(recordNews(recordCoachMeetings(released, played, state), state.date, events, day.sheets), state.date, played);
  events.push(...happened.events);
  const eggs = findEggs(happened.state, state, state.date, events, live.matches);
  events.push(...eggs.events);
  const moments = runMoments(recordDayEvents(eggs.state, events, state), state, events);
  events.push(...moments.events);
  moments.waitingEvents.forEach((own, index) => waitingEvents[index]?.push(...own));
  return state.waitingCoaches ? { state: moments.state, events, waitingEvents } : { state: moments.state, events };
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
