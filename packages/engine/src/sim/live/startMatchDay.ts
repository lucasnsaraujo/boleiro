import { simulateMatch } from "../../engine/match.js";
import { keyedStream, randomStream } from "../../engine/random.js";
import type { DayDecisions, DayEvent } from "../advanceDay.js";
import { guestClubOf, guestSquadOf } from "../continental/guestClubs.js";
import { CARD_RATES, cardCompetitionOf } from "../discipline/cardRates.js";
import { countCards, drawCards, markedCardRates, sendOffMinutes } from "../discipline/drawCards.js";
import { openDisciplineDay } from "../discipline/recordCards.js";
import { refuseSuspended } from "../discipline/suspendedPlayers.js";
import type { GameState, SimPlayer } from "../gameState.js";
import type { MatchSheets } from "../history/recordMatches.js";
import { clubMood } from "../morale/clubMood.js";
import { withoutCrowd } from "../morale/withoutCrowd.js";
import { paramsForCompetition } from "../paramsForCompetition.js";
import { isInjured } from "../players/isInjured.js";
import { matchSetup, playingStrength, type CoachPlan } from "../players/matchSetup.js";
import { fatigueOn } from "../players/fatigueOn.js";
import { drawMatchInjuries, recordMatchLoad } from "../players/recordMatchLoad.js";
import { squadsByClub } from "../players/squadsByClub.js";
import { isShootoutDue, settleShootout, shootoutSeed } from "../settleShootout.js";
import { aiBench, onPitchAt, tirednessOn } from "./aiSubstitutions.js";
import { waitingCoachesOf } from "../coach/humanCoaches.js";
import { coachOutcome } from "./coachOutcome.js";
import { formOfTheDay, formStrength } from "./formOfTheDay.js";
import { incidentHandling } from "./incidentHandling.js";
import type { CoachMatch, LiveDay, LiveMatch } from "./liveDay.js";
import { drawMatchPlay } from "./matchPlay.js";
import { detailStream, FULL_TIME, inMatchOrder, kickOffTimeline, scorerStream } from "./matchTimeline.js";

const LINEUP_SIZE = 11;
// Goal minutes and redraws of the coach's match draw from streams of their own, so the day's
// results stay as the main stream has always drawn them.
const TIMELINE_STREAM_SALT = 0x71e11e;
const COACH_MATCH_STREAM_SALT = 0xc0ac5;

/** Club squads, indexed on first use: most days have no match and need none. A continental cup's guest from abroad brings its own. */
function squadsOf(state: GameState): (clubId: string) => SimPlayer[] {
  let squads: Map<string, SimPlayer[]> | null = null;
  return (clubId) => {
    squads ??= squadsByClub(state.players);
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
function waitingPlansOf(state: GameState, decisions: DayDecisions): Record<string, CoachPlan> {
  const plans: Record<string, CoachPlan> = {};
  waitingCoachesOf(state).forEach((waiting, index) => {
    if (!waiting.clubId) return;
    const own = decisions.waiting?.[index] ?? {};
    plans[waiting.clubId] = { lineup: coachLineupOf({ ...state, coachClubId: waiting.clubId }, own), tactics: own.tactics ?? waiting.coach.tactics };
  });
  return plans;
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
  const playedToday: SimPlayer[] = [];
  const cards = openDisciplineDay(state.discipline);
  const sheets: MatchSheets = {};
  const matches: LiveMatch[] = [];
  let coachMatch: CoachMatch | null = null;
  const waitingMatches: CoachMatch[] = [];
  const planOf = (clubId: string): CoachPlan | undefined => (clubId === state.coachClubId ? coach : waiting[clubId]);

  const fixtures = state.fixtures.map((fixture) => {
    if (fixture.date !== state.date || fixture.result) return fixture;
    const competition = state.competitions[fixture.competitionId];
    if (!competition) throw new Error(`fixture ${fixture.id} has no competition ${fixture.competitionId}`);
    const suspended = cards.suspended(fixture.competitionId);
    const coachClubId = [fixture.homeId, fixture.awayId].find((id) => id === state.coachClubId);
    if (coachClubId) refuseSuspended(coach.lineup ?? [], suspended);
    for (const clubId of [fixture.homeId, fixture.awayId]) refuseSuspended(waiting[clubId]?.lineup ?? [], suspended);
    const available = (clubId: string) => squad(clubId).filter((p) => !suspended.has(p.id));
    const forms = new Map<string, number>();
    const formOf = (p: SimPlayer) => {
      let form = forms.get(p.id);
      if (form === undefined) forms.set(p.id, (form = formOfTheDay(state.seed, fixture.id, p.id, { morale: clubMood(state, p.clubId).squad, fatigue: fatigueOn(p, state.date) })));
      return form;
    };
    const formStrengthOf = (p: SimPlayer) => formStrength(formOf(p));
    const setup = matchSetup(state, fixture, available, coach, waiting, formStrengthOf);
    const cardRates = CARD_RATES[cardCompetitionOf(competition)];
    const markingOf = (clubId: string) => planOf(clubId)?.tactics.marking;
    const bookings = drawCards(setup.homeLineup, setup.awayLineup, markedCardRates(cardRates, { home: markingOf(fixture.homeId), away: markingOf(fixture.awayId) }), random.next);
    const params = withoutCrowd(paramsForCompetition(competition), clubMood(state, fixture.homeId));
    const goals = simulateMatch(setup.home, setup.away, random.next, params, sendOffMinutes(bookings, fixture.homeId));
    const score = { ...goals, cards: countCards(bookings, fixture.homeId) };
    const shootout = isShootoutDue(state, { ...fixture, result: score }) ? shootoutSeed(random.next) : null;
    const injuries = drawMatchInjuries([...setup.homeLineup, ...setup.awayLineup], setup.context, random.next);
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
    const timeline = kickOffTimeline(
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
        injuries,
      },
      timelineRandom,
      scorerStream(state.seed, fixture.id),
      detailStream(state.seed, fixture.id),
    );
    const shootoutSide = (clubId: string, lineup: readonly SimPlayer[], bench: readonly SimPlayer[]) => {
      const order = planOf(clubId)?.tactics.kickerOrder;
      return { clubId, onPitch: onPitchAt(lineup, bench, timeline.events, clubId, FULL_TIME + 1), morale: clubMood(state, clubId).squad, ...(order ? { order } : {}) };
    };
    const settled =
      shootout === null
        ? { fixture: { ...fixture, result: score }, events: [] }
        : settleShootout({ ...fixture, result: score }, shootout, shootoutSide(homeId, setup.homeLineup, benches.home), shootoutSide(awayId, setup.awayLineup, benches.away), strength);
    const played = settled.fixture;
    const play = drawMatchPlay(
      state.seed,
      fixture.id,
      [...setup.homeLineup, ...setup.awayLineup],
      [...mayComeOn(homeId, setup.homeLineup, benches.home), ...mayComeOn(awayId, setup.awayLineup, benches.away)],
      formOf,
    );
    matches.push({ fixtureId: fixture.id, homeId, awayId, formations: setup.formations, events: inMatchOrder([...timeline.events, ...settled.events]), play });
    const lineups = timeline.played;

    // The seated coach's match opens for him; one between two waiting coaches, for the first of them.
    const ownerId = coachClubId ?? [homeId, awayId].find(isHuman);
    const ownerPlan = ownerId && planOf(ownerId);
    if (ownerId && ownerPlan) {
      const kickOff = coachOutcome(
        state,
        competition,
        { played, context: setup.context, awayTravelKm: setup.awayTravelKm, lineups, minutes: timeline.minutes, bookings, injuries, scorers: timeline.scorers },
        random.next,
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
    events.push(...cards.record(competition, played, bookings, (id) => state.players[id]?.clubId, random.next));
    sheets[played.id] = { ...lineups, scorers: timeline.scorers };
    return played;
  });

  return {
    state,
    decisions,
    matches,
    coachMatch,
    ...(waitingMatches.length ? { waitingMatches } : {}),
    rest: { fixtures, events, players: playedToday, discipline: cards.discipline(), sheets, rngState: random.state() },
  };
}
