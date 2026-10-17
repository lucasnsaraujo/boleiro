import { simulateMatch } from "../../engine/match.js";
import { keyedStream, randomStream } from "../../engine/random.js";
import type { DayDecisions, DayEvent } from "../advanceDay.js";
import { guestClubOf, guestSquadOf } from "../continental/guestClubs.js";
import { CARD_RATES, cardCompetitionOf } from "../discipline/cardRates.js";
import { countCards, drawCards, markedCardRates, sendOffMinutes } from "../discipline/drawCards.js";
import { openDisciplineDay } from "../discipline/recordCards.js";
import { refuseSuspended } from "../discipline/suspendedPlayers.js";
import { matchOfficials, refereedCardRates } from "../referees/matchOfficials.js";
import { withRefereeCalls } from "../referees/refereeCalls.js";
import type { Competition, Fixture, GameState, SimPlayer } from "../gameState.js";
import type { MatchSheets } from "../history/recordMatches.js";
import { clubMood } from "../morale/clubMood.js";
import { withoutCrowd } from "../morale/withoutCrowd.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { isInjured } from "../players/isInjured.js";
import { matchSetup, playingStrength, type CoachPlan } from "../players/matchSetup.js";
import { fatigueOn } from "../players/fatigueOn.js";
import { drawMatchInjuries, injuryStreamOf, recordMatchLoad } from "../players/recordMatchLoad.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { isShootoutDue, settleShootout, shootoutSeed } from "../settleShootout.js";
import { hasExtraTime, tieBreakOf } from "../tieBreaks.js";
import { aiBench, onPitchAt, tirednessOn } from "./aiSubstitutions.js";
import { waitingCoachesOf } from "../coach/humanCoaches.js";
import { withLoaneesFacingOwner } from "../transfers/loans.js";
import { coachOutcome } from "./coachOutcome.js";
import { formOfTheDay, formStrength } from "./formOfTheDay.js";
import { kickOffMoment, kickOffTalksOf, talkEffect, type TalkTone } from "./teamTalk.js";
import { incidentHandling } from "./incidentHandling.js";
import type { CoachMatch, LiveDay, LiveMatch } from "./liveDay.js";
import { drawMatchPlay } from "./matchPlay.js";
import { detailStream, EXTRA_TIME_END, FULL_TIME, inMatchOrder, kickOffTimeline, scorerStream } from "./matchTimeline.js";
import { bookingsOf, extraTimeStream, playExtraTime, withExtraTime } from "./playExtraTime.js";

const LINEUP_SIZE = 11;
const EXTRA_TIME_CARDS_SALT = 0xca7d;

/** A stream that hands out `count` draws of `first`, then draws of `then`. */
function firstDrawsFrom(first: () => number, count: number, then: () => number): () => number {
  let left = count;
  return () => (left-- > 0 ? first() : then());
}
// Goal minutes and redraws of the coach's match draw from streams of their own, so the day's
// results stay as the main stream has always drawn them.
const TIMELINE_STREAM_SALT = 0x71e11e;
const COACH_MATCH_STREAM_SALT = 0xc0ac5;

/** Club squads, the game's shared ones (squadsOfGame). A continental cup's guest from abroad brings its own. */
export function squadsOf(state: GameState): (clubId: string) => readonly SimPlayer[] {
  return (clubId) => {
    const squads = squadsOfGame(state);
    const guest = squads.has(clubId) ? null : guestClubOf(state, clubId);
    return guest ? guestSquadOf(guest) : (squads.get(clubId) ?? []);
  };
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

/** Each waiting hot-seat coach's plan for his club's match, by club: the eleven he picked on his turn and his tactics. */
export function waitingPlansOf(state: GameState, decisions: DayDecisions): Record<string, CoachPlan> {
  const plans: Record<string, CoachPlan> = {};
  waitingCoachesOf(state).forEach((waiting, index) => {
    if (!waiting.clubId) return;
    const own = decisions.waiting?.[index] ?? {};
    plans[waiting.clubId] = { lineup: coachLineupOf({ ...state, coachClubId: waiting.clubId }, own), tactics: own.tactics ?? waiting.coach.tactics };
  });
  return plans;
}

/**
 * A fixture's two sides as the match engine lines them up on its day, and the engine's parameters for it:
 * without the players `suspended` from it, with each human coach's plan and each player's form of the day,
 * which a human coach's talk before kick-off (`talks`, by club) shifts.
 */
export function fixtureSides(
  state: GameState,
  fixture: Fixture,
  competition: Competition,
  squad: (clubId: string) => readonly SimPlayer[],
  plans: { coach: CoachPlan; waiting: Readonly<Record<string, CoachPlan>>; suspended: ReadonlySet<string>; talks?: Readonly<Record<string, TalkTone>> },
) {
  const available = (clubId: string) => squad(clubId).filter((p) => !plans.suspended.has(p.id));
  const forms = new Map<string, number>();
  const talkShift = (clubId: string) => {
    const talk = plans.talks?.[clubId];
    return talk ? talkEffect(talk, kickOffMoment(state, fixture, clubId)).form : 0;
  };
  const formOf = (p: SimPlayer) => {
    let form = forms.get(p.id);
    if (form === undefined) {
      const drawn = formOfTheDay(state.seed, fixture.id, p.id, { morale: clubMood(state, p.clubId).squad, fatigue: fatigueOn(p, state.date) });
      const shift = talkShift(p.clubId);
      forms.set(p.id, (form = shift ? Math.max(-1, Math.min(1, drawn + shift)) : drawn));
    }
    return form;
  };
  const formStrengthOf = (p: SimPlayer) => formStrength(formOf(p));
  const setup = matchSetup(state, fixture, available, plans.coach, plans.waiting, formStrengthOf);
  const params = withoutCrowd(paramsForCompetition(competition, fixture.stage), clubMood(state, fixture.homeId));
  return { available, formOf, formStrengthOf, setup, params };
}

/** A redraw stream for a waiting coach's match, apart from the seated coach's and from every other match's. */
function waitingMatchStream(state: GameState, fixtureId: string): number {
  return Math.floor(keyedStream(state.rngState ^ COACH_MATCH_STREAM_SALT, fixtureId)() * 2 ** 32);
}

/**
 * Kicks off today's matches: every match is drawn as advanceDay always drew it and gets its
 * timeline. Each human coach's match stays open for applyLiveChange until finishMatchDay; the
 * others are recorded at once.
 */
export function startMatchDay(state: GameState, decisions: DayDecisions): LiveDay {
  const random = randomStream(state.rngState);
  const timelineRandom = randomStream(state.rngState ^ TIMELINE_STREAM_SALT).next;
  const events: DayEvent[] = [];
  const squad = squadsOf(state);
  const coach: CoachPlan = { lineup: coachLineupOf(state, decisions), tactics: decisions.tactics ?? state.coach.tactics };
  const waiting = waitingPlansOf(state, decisions);
  const talks = kickOffTalksOf(state, decisions);
  const playedToday: SimPlayer[] = [];
  const cards = openDisciplineDay(state.discipline);
  const sheets: MatchSheets = {};
  const matches: LiveMatch[] = [];
  let coachMatch: CoachMatch | null = null;
  const waitingMatches: CoachMatch[] = [];
  const planOf = (clubId: string): CoachPlan | undefined => (clubId === state.coachClubId ? coach : waiting[clubId]);

  const playFixture = (fixture: Fixture): Fixture => {
    const competition = state.competitions[fixture.competitionId];
    if (!competition) throw new Error(`fixture ${fixture.id} has no competition ${fixture.competitionId}`);
    const suspended = withLoaneesFacingOwner(cards.suspended(fixture.competitionId), state, fixture);
    const coachClubId = [fixture.homeId, fixture.awayId].find((id) => id === state.coachClubId);
    if (coachClubId) refuseSuspended(coach.lineup ?? [], suspended);
    for (const clubId of [fixture.homeId, fixture.awayId]) refuseSuspended(waiting[clubId]?.lineup ?? [], suspended);
    const { available, formOf, formStrengthOf, setup, params } = fixtureSides(state, fixture, competition, squad, { coach, waiting, suspended, talks });
    const officials = matchOfficials(state.seed, competition, fixture);
    const cardRates = refereedCardRates(CARD_RATES[cardCompetitionOf(competition)], officials);
    const markingOf = (clubId: string) => planOf(clubId)?.tactics.marking;
    const bookings = drawCards(setup.homeLineup, setup.awayLineup, markedCardRates(cardRates, { home: markingOf(fixture.homeId), away: markingOf(fixture.awayId) }), random.next);
    const goals = simulateMatch(setup.home, setup.away, random.next, params, sendOffMinutes(bookings, fixture.homeId));
    const afterNinety = { ...goals, cards: countCards(bookings, fixture.homeId) };
    // A tie level after ninety minutes always takes its shootout's draw, so the day's stream runs the same whatever settles it.
    const shootout = isShootoutDue(state, { ...fixture, result: afterNinety }) ? shootoutSeed(random.next) : null;
    const tieBreak = shootout === null ? null : tieBreakOf(competition, fixture.stage);
    const injuryStream = injuryStreamOf(state.seed, fixture.id);
    const ninetyInjuries = drawMatchInjuries([...setup.homeLineup, ...setup.awayLineup], setup.context, random.next, injuryStream);
    const { homeId, awayId } = fixture;
    // Each player's strength today, worked out once: goal kinds, penalties and substitutions ask for it again and again.
    const strengths = new Map<string, (p: SimPlayer) => number>();
    const known = new Map<string, number>();
    const strength = (p: SimPlayer) => {
      const cached = known.get(p.id);
      if (cached !== undefined) return cached;
      let own = strengths.get(p.clubId);
      if (!own) strengths.set(p.clubId, (own = playingStrength(state, p.clubId, setup.context, available(p.clubId))));
      const today = own(p) + formStrengthOf(p);
      known.set(p.id, today);
      return today;
    };
    const isFit = (p: SimPlayer) => !isInjured(p, state.date);
    const isHuman = (clubId: string) => incidentHandling(state, clubId) === "askCoach";
    const benchOf = (clubId: string, lineup: readonly SimPlayer[]) => (isHuman(clubId) ? [] : aiBench(available(clubId), lineup, isFit));
    const benches = { home: benchOf(homeId, setup.homeLineup), away: benchOf(awayId, setup.awayLineup) };
    const humanBench = (clubId: string, lineup: readonly SimPlayer[]) => available(clubId).filter((p) => isFit(p) && !lineup.includes(p));
    const mayComeOn = (clubId: string, lineup: readonly SimPlayer[], bench: readonly SimPlayer[]) => (isHuman(clubId) ? humanBench(clubId, lineup) : bench);
    const takerOf = (clubId: string) => planOf(clubId)?.tactics.penaltyTakerId ?? null;
    const ninety = kickOffTimeline(
      {
        homeId,
        awayId,
        ...setup,
        benches,
        aiSides: { home: !isHuman(homeId), away: !isHuman(awayId) },
        penaltyTakers: { home: takerOf(homeId), away: takerOf(awayId) },
        strength,
        tiredness: (p) => tirednessOn(p, state.date),
        goals,
        bookings,
        injuries: ninetyInjuries,
      },
      timelineRandom,
      scorerStream(state.seed, fixture.id),
      detailStream(state.seed, fixture.id),
    );
    const extraTimeMatch = {
      clubIds: { home: homeId, away: awayId },
      starters: { home: setup.homeLineup, away: setup.awayLineup },
      benches,
      aiSides: { home: !isHuman(homeId), away: !isHuman(awayId) },
      penaltyTakers: { home: takerOf(homeId), away: takerOf(awayId) },
      strength,
      tiredness: (p: SimPlayer) => tirednessOn(p, state.date),
      teams: { home: setup.home, away: setup.away },
      params,
      cardRates: markedCardRates(cardRates, { home: markingOf(homeId), away: markingOf(awayId) }),
      context: setup.context,
      injuryStream,
    };
    const timeline = tieBreak === "extraTime" ? withExtraTime(ninety, playExtraTime(extraTimeMatch, ninety.events, extraTimeStream(state.seed, fixture.id)), extraTimeMatch) : ninety;
    const isExtraTime = timeline !== ninety;
    const allBookings = isExtraTime ? [...bookings, ...bookingsOf(timeline.events.filter((e) => e.minute > FULL_TIME))] : bookings;
    // A straight red's ban length is drawn as its card is recorded: the ninety minutes' from the day's stream, extra time's from one of its own.
    const cardRandom = isExtraTime ? firstDrawsFrom(random.next, bookings.filter((b) => b.card === "red").length, extraTimeStream(state.seed ^ EXTRA_TIME_CARDS_SALT, fixture.id)) : random.next;
    const extraTimeInjuries = timeline.events.flatMap((e) => (e.type === "injury" && e.minute > FULL_TIME ? [[e.playerId, { days: e.days, kind: e.kind ?? "knock", isRecurrence: e.isRecurrence === true }] as const] : []));
    const injuries = isExtraTime ? new Map([...ninetyInjuries, ...extraTimeInjuries]) : ninetyInjuries;
    const goalsOf = (clubId: string) => timeline.events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
    const score = isExtraTime ? { homeGoals: goalsOf(homeId), awayGoals: goalsOf(awayId), isAfterExtraTime: true as const, cards: countCards(allBookings, homeId) } : afterNinety;
    const end = isExtraTime ? EXTRA_TIME_END : FULL_TIME;
    const shootoutSide = (clubId: string, lineup: readonly SimPlayer[], bench: readonly SimPlayer[]) => {
      const order = planOf(clubId)?.tactics.kickerOrder;
      return { clubId, onPitch: onPitchAt(lineup, bench, timeline.events, clubId, end + 1), morale: clubMood(state, clubId).squad, ...(order ? { order } : {}) };
    };
    const isShootout = shootout !== null && tieBreak !== "betterSeed" && (!isExtraTime || isShootoutDue(state, { ...fixture, result: score }));
    const settled = isShootout
      ? settleShootout({ ...fixture, result: score }, shootout, shootoutSide(homeId, setup.homeLineup, benches.home), shootoutSide(awayId, setup.awayLineup, benches.away), strength, end)
      : { fixture: { ...fixture, result: score }, events: [] };
    const played = settled.fixture;
    const play = drawMatchPlay(
      state.seed,
      fixture.id,
      [...setup.homeLineup, ...setup.awayLineup],
      [...mayComeOn(homeId, setup.homeLineup, benches.home), ...mayComeOn(awayId, setup.awayLineup, benches.away)],
      formOf,
      fixture.tie !== undefined && hasExtraTime(competition, fixture.stage, competition.stageDates[fixture.stage]?.indexOf(fixture.date) ?? -1),
    );
    const callSide = (clubId: string, lineup: readonly SimPlayer[], bench: readonly SimPlayer[]) => ({ clubId, onPitch: (minute: number) => onPitchAt(lineup, bench, timeline.events, clubId, minute) });
    const told = withRefereeCalls(inMatchOrder([...timeline.events, ...settled.events]), {
      seed: state.seed,
      fixtureId: fixture.id,
      officials,
      home: callSide(homeId, setup.homeLineup, benches.home),
      away: callSide(awayId, setup.awayLineup, benches.away),
    });
    matches.push({ fixtureId: fixture.id, homeId, awayId, formations: setup.formations, events: told, play });
    const lineups = timeline.played;

    // The seated coach's match opens for him; one between two waiting coaches, for the first of them.
    const ownerId = coachClubId ?? [homeId, awayId].find(isHuman);
    const ownerPlan = ownerId && planOf(ownerId);
    if (ownerId && ownerPlan) {
      const kickOff = coachOutcome(
        state,
        competition,
        { played, context: setup.context, awayTravelKm: setup.awayTravelKm, lineups, minutes: timeline.minutes, bookings: allBookings, injuries, scorers: timeline.scorers },
        cardRandom,
      );
      const coachLineup = ownerId === homeId ? setup.homeLineup : setup.awayLineup;
      const opponentId = ownerId === homeId ? awayId : homeId;
      const bench = humanBench(ownerId, coachLineup);
      const strengthsOf = (players: readonly SimPlayer[]) => players.map((p) => [p.id, strength(p)] as const);
      const opponentLineup = opponentId === homeId ? setup.homeLineup : setup.awayLineup;
      const rivalPlan = isHuman(opponentId) ? planOf(opponentId) : undefined;
      const opponentBench = rivalPlan ? humanBench(opponentId, opponentLineup) : opponentId === homeId ? benches.home : benches.away;
      const isSeated = ownerId === coachClubId;
      const open: CoachMatch = {
        ...(isSeated ? {} : { clubId: ownerId }),
        fixtureId: fixture.id,
        context: setup.context,
        awayTravelKm: setup.awayTravelKm,
        params,
        cardRates,
        starters: { home: setup.homeLineup, away: setup.awayLineup },
        bench,
        opponentBench,
        strengths: Object.fromEntries([...strengthsOf([...coachLineup, ...bench]), ...strengthsOf([...opponentLineup, ...opponentBench])]),
        tactics: ownerPlan.tactics,
        ...(rivalPlan ? { rivalTactics: rivalPlan.tactics } : {}),
        lastChangeMinute: 0,
        rngState: isSeated ? state.rngState ^ COACH_MATCH_STREAM_SALT : waitingMatchStream(state, fixture.id),
        kickOff,
        isChanged: false,
        eventsIndex: events.length,
      };
      if (isSeated) coachMatch = open;
      else waitingMatches.push(open);
      return fixture;
    }

    events.push({ type: "matchPlayed", fixture: played });
    const load = recordMatchLoad({ ...setup, homeLineup: lineups.home, awayLineup: lineups.away, result: score }, injuries, timeline.minutes);
    playedToday.push(...load.players);
    events.push(...load.events);
    events.push(...cards.record(competition, played, allBookings, (id) => state.players[id]?.clubId, cardRandom));
    sheets[played.id] = { ...lineups, scorers: timeline.scorers };
    return played;
  };
  // The season's fixtures are thousands and a day has a few dozen, so only today's are played.
  const fixtures = state.fixtures.slice();
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    if (fixture && fixture.date === state.date && !fixture.result) fixtures[i] = playFixture(fixture);
  }

  return {
    state,
    decisions,
    matches,
    coachMatch,
    ...(waitingMatches.length ? { waitingMatches } : {}),
    rest: { fixtures, events, players: playedToday, discipline: cards.discipline(), sheets, rngState: random.state() },
  };
}
