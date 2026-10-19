import type { Formation } from "../../engine/formations.js";
import type { Score } from "../../engine/match.js";
import { keyedStream } from "../../engine/random.js";
import { guestClubOf, guestSquadOf } from "../continental/guestClubs.js";
import { CARD_RATES, cardCompetitionOf, type CardRates } from "../discipline/cardRates.js";
import type { CardCount } from "../discipline/discipline.js";
import { drawCards, type Booking } from "../discipline/drawCards.js";
import type { Fixture, GameState, MatchResult, SimPlayer } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { isInjured } from "../players/isInjured.js";
import { matchSetup } from "../players/matchSetup.js";
import { isNationalTeam, nationalSquadOf } from "../nations/nationalSquad.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { matchOfficials } from "../referees/matchOfficials.js";
import { withRefereeCalls } from "../referees/refereeCalls.js";
import { aggregate } from "../tieResults.js";
import { aiBench, onPitchAt, tirednessOn } from "./aiSubstitutions.js";
import { formOfTheDay } from "./formOfTheDay.js";
import { drawMatchPlay, type MatchPlay } from "./matchPlay.js";
import { scorersOf } from "../history/scorersOf.js";
import { describeGoals, type GoalEvent } from "./goalDetails.js";
import { detailStream, EXTRA_TIME_END, FULL_TIME, inMatchOrder, kickOffTimeline, scorerStream, whistlesTo, type KickOffTimeline, type MatchEvent } from "./matchTimeline.js";

type Sides<T> = { home: T; away: T };

/** A played match as told again: who started in which shape, who sat on the bench, its timeline and every player's play. */
export type RegeneratedMatch = {
  formations: Sides<Formation>;
  starters: Sides<SimPlayer[]>;
  benches: Sides<SimPlayer[]>;
  events: MatchEvent[];
  play: MatchPlay;
};

// The retelling's goal minutes and cards draw from streams of their own, apart from every stream the day played on.
const EXTRA_TIME_STREAM_SALT = 0xe7a2;
const MINUTES_STREAM_SALT = 0x5e7e11;
const CARDS_STREAM_SALT = 0xca7d5;
// A form drawn without the day's mood and load: a neutral morale and a rested player.
const NEUTRAL_PULL = { morale: 50, fatigue: 5 };
// Far beyond any player's tiredness (fatigue up to 100, plus age).
const FRESH_SUBSTITUTE = 1_000;

/**
 * The cards a side really got (`count`), given to its players: each yellow to a different player at
 * any minute, each red a second yellow for a booked player as often as reds are, or else a straight
 * red late in the match.
 */
function bookingsOf(lineup: readonly SimPlayer[], count: CardCount, secondYellowShare: number, random: () => number): Booking[] {
  const pool = [...lineup].filter((p) => p.group !== "GK");
  const take = () => pool.splice(Math.floor(random() * pool.length), 1)[0];
  const bookings: Booking[] = [];
  const yellowed: Booking[] = [];
  for (let i = 0; i < count.yellows; i++) {
    const player = take();
    if (!player) break;
    const booking: Booking = { playerId: player.id, clubId: player.clubId, card: "yellow", minute: 1 + Math.floor(random() * (FULL_TIME - 1)) };
    bookings.push(booking);
    yellowed.push(booking);
  }
  for (let i = 0; i < count.reds; i++) {
    const booked = random() < secondYellowShare ? yellowed.shift() : undefined;
    if (booked) {
      bookings.push({ ...booked, card: "secondYellow", minute: booked.minute + 1 + Math.floor(random() * (FULL_TIME - booked.minute)) });
      continue;
    }
    const player = take();
    if (player) bookings.push({ playerId: player.id, clubId: player.clubId, card: "red", minute: Math.round(FULL_TIME * random() ** 0.32) || 1 });
  }
  return bookings;
}

/**
 * A played match told again from its fixture's seed, for a match whose events the save does not
 * keep: a past match, or one of a league or a national competition played result-only. Both sides line up as their AI coach
 * would pick from today's squads; the real score and, when known, each side's real cards are spread
 * over the match as a live one spreads them. Scorers, goal details and substitutions draw from the
 * same streams as the live match did, so a side that lines up the same names the same scorers. A match
 * that went to extra time left its tie level after ninety minutes (ninetyMinutesOf).
 */
export function regenerateMatch(state: GameState, fixture: Fixture & { result: MatchResult }): RegeneratedMatch {
  const squadOf = (clubId: string): readonly SimPlayer[] => {
    if (!state.clubs[clubId] && isNationalTeam(state, clubId)) return nationalSquadOf(state, clubId);
    const guest = state.clubs[clubId] ? null : guestClubOf(state, clubId);
    return guest ? guestSquadOf(guest) : (squadsOfGame(state).get(clubId) ?? []);
  };
  const setup = matchSetup(state, fixture, squadOf, { lineup: null, tactics: state.coach.tactics });
  const isFit = (p: SimPlayer) => !isInjured(p, fixture.date);
  const benches = { home: aiBench(squadOf(fixture.homeId), setup.homeLineup, isFit), away: aiBench(squadOf(fixture.awayId), setup.awayLineup, isFit) };
  const starters = new Set([...setup.homeLineup, ...setup.awayLineup].map((p) => p.id));
  const competition = state.competitions[fixture.competitionId];
  const rates: CardRates = competition ? CARD_RATES[cardCompetitionOf(competition)] : CARD_RATES.A;
  const cardsRandom = keyedStream(state.seed ^ CARDS_STREAM_SALT, fixture.id);
  const { cards } = fixture.result;
  const bookings = cards
    ? [...bookingsOf(setup.homeLineup, cards.home, rates.secondYellowShare, cardsRandom), ...bookingsOf(setup.awayLineup, cards.away, rates.secondYellowShare, cardsRandom)]
    : drawCards(setup.homeLineup, setup.awayLineup, rates, cardsRandom);
  const { isAfterExtraTime } = fixture.result;
  const ninety = isAfterExtraTime ? ninetyMinutesOf(state, fixture) : fixture.result;
  const told = kickOffTimeline(
    {
      homeId: fixture.homeId,
      awayId: fixture.awayId,
      homeLineup: setup.homeLineup,
      awayLineup: setup.awayLineup,
      benches,
      aiSides: { home: true, away: true },
      penaltyTakers: { home: null, away: null },
      strength: (p) => p.strength,
      // A substitute counts as fresher than any starter, so a side with no fatigue on record (a club abroad) never takes off the man it just sent on.
      tiredness: (p) => tirednessOn(p, fixture.date) - (starters.has(p.id) ? 0 : FRESH_SUBSTITUTE),
      goals: { homeGoals: ninety.homeGoals, awayGoals: ninety.awayGoals },
      bookings,
      injuries: new Map(),
    },
    keyedStream(state.seed ^ MINUTES_STREAM_SALT, fixture.id),
    scorerStream(state.seed, fixture.id),
    detailStream(state.seed, fixture.id),
  );
  const timeline = isAfterExtraTime ? withExtraTimeGoals(told, fixture, ninety, { home: setup.homeLineup, away: setup.awayLineup }, benches, keyedStream(state.seed ^ EXTRA_TIME_STREAM_SALT, fixture.id)) : told;
  const pullOf = (p: SimPlayer) => (state.clubs[p.clubId] ? { morale: clubMood(state, p.clubId).squad, fatigue: NEUTRAL_PULL.fatigue } : NEUTRAL_PULL);
  const play = drawMatchPlay(state.seed, fixture.id, [...setup.homeLineup, ...setup.awayLineup], [...benches.home, ...benches.away], (p) =>
    formOfTheDay(state.seed, fixture.id, p.id, pullOf(p)),
    isAfterExtraTime === true,
  );
  const officials = competition ? matchOfficials(state.seed, competition, fixture) : { referee: null, strictness: 1, var: null };
  const callSide = (clubId: string, lineup: readonly SimPlayer[], bench: readonly SimPlayer[]) => ({ clubId, onPitch: (minute: number) => onPitchAt(lineup, bench, timeline.events, clubId, minute) });
  const events = withRefereeCalls(timeline.events, {
    seed: state.seed,
    fixtureId: fixture.id,
    officials,
    home: callSide(fixture.homeId, setup.homeLineup, benches.home),
    away: callSide(fixture.awayId, setup.awayLineup, benches.away),
  });
  return { formations: setup.formations, starters: { home: setup.homeLineup, away: setup.awayLineup }, benches, events, play };
}

/**
 * The score after ninety minutes of a match that went to extra time: one that leaves its tie level on
 * aggregate with the tie's other legs. guess: as few of the match's goals as that allows go in extra time.
 */
function ninetyMinutesOf(state: GameState, fixture: Fixture & { result: MatchResult }): Score {
  const { homeGoals, awayGoals } = fixture.result;
  const otherLegs = state.fixtures.filter((f) => fixture.tie !== undefined && f.competitionId === fixture.competitionId && f.stage === fixture.stage && f.tie === fixture.tie && f.id !== fixture.id);
  // How many goals more than the visitors the home side must score in the ninety minutes to level the tie.
  const margin = aggregate(fixture.awayId, otherLegs) - aggregate(fixture.homeId, otherLegs);
  const home = Math.max(0, Math.min(homeGoals, awayGoals + margin));
  return { homeGoals: home, awayGoals: Math.max(0, home - margin) };
}

/**
 * A retold match's extra time: the goals over its ninety minutes' score, at minutes spread over its thirty,
 * scored by players on the pitch then, with extra time's whistles. guess: no cards or substitutions in it.
 */
function withExtraTimeGoals(told: KickOffTimeline, fixture: Fixture & { result: MatchResult }, ninety: Score, starters: Sides<SimPlayer[]>, benches: Sides<SimPlayer[]>, random: () => number): KickOffTimeline {
  const onPitch = (s: "home" | "away", minute: number) => onPitchAt(starters[s], benches[s], told.events, s === "home" ? fixture.homeId : fixture.awayId, minute);
  const extraGoals = (side: "home" | "away") => {
    const clubId = side === "home" ? fixture.homeId : fixture.awayId;
    const count = side === "home" ? fixture.result.homeGoals - ninety.homeGoals : fixture.result.awayGoals - ninety.awayGoals;
    return Array.from({ length: count }, () => FULL_TIME + 1 + Math.floor(random() * (EXTRA_TIME_END - FULL_TIME))).map((minute) => ({ side, clubId, minute }));
  };
  const minutes = [...extraGoals("home"), ...extraGoals("away")].sort((a, b) => a.minute - b.minute);
  const drawn = minutes.flatMap(({ side, clubId, minute }): GoalEvent[] => scorersOf(onPitch(side, minute), 1, random).map((playerId) => ({ type: "goal", minute, clubId, playerId })));
  const sides = {
    home: { clubId: fixture.homeId, onPitch: (minute: number) => onPitch("home", minute), penaltyTakerId: null },
    away: { clubId: fixture.awayId, onPitch: (minute: number) => onPitch("away", minute), penaltyTakerId: null },
  };
  const goals = describeGoals(drawn, sides, (p) => p.strength, random);
  const events = inMatchOrder([...told.events, ...goals, ...whistlesTo(EXTRA_TIME_END).filter((w) => w.minute > FULL_TIME)]);
  const scorers = (clubId: string) => goals.filter((g) => g.clubId === clubId && g.kind !== "ownGoal").map((g) => g.playerId);
  return { ...told, events, scorers: { home: [...told.scorers.home, ...scorers(fixture.homeId)], away: [...told.scorers.away, ...scorers(fixture.awayId)] } };
}

