import type { Formation } from "../../engine/formations.js";
import { matchOdds, type Marking, type Play, type Posture, type Team } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { aiPosture, DEFAULT_TACTICS, type Tactics } from "../coach/tactics.js";
import { drawCardsAfter, markedCardRates } from "../discipline/drawCards.js";
import type { SimPlayer } from "../gameState.js";
import { scorersOf } from "../history/scorersOf.js";
import { clubMood } from "../morale/clubMood.js";
import { drawInjury, matchInjuryChance } from "../players/matchInjuryChance.js";
import { injuryStreamOf } from "../players/recordMatchLoad.js";
import { engineTeam } from "../players/matchSetup.js";
import { matchOfficials } from "../referees/matchOfficials.js";
import { withRefereeCalls } from "../referees/refereeCalls.js";
import { isShootoutDue, settleShootout, shootoutSeed } from "../settleShootout.js";
import { tieBreakOf } from "../tieBreaks.js";
import { planOfClub } from "../coach/matchPlan.js";
import { isLockedToPlans } from "./incidentHandling.js";
import { isPlanActive, nextPlanMove, type PlanMove, type PlanSide } from "./planSubstitutions.js";
import { aiSubstitutions, EXTRA_TIME_SUBSTITUTIONS, EXTRA_TIME_WINDOWS, isFreeWindow, MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS, onPitchAt, tirednessOn } from "./aiSubstitutions.js";
import { describeGoals, drawPenaltyMisses, type GoalEvent, type GoalSide } from "./goalDetails.js";
import type { CoachMatch, LiveDay, LiveMatch } from "./liveDay.js";
import { drawMinute, EXTRA_TIME_END, FULL_TIME, goalMinuteWeights, HALF_TIME, inMatchOrder, isWhistle, matchEndOf, sentOffMinute, whistlesTo, type MatchEvent } from "./matchTimeline.js";
import { formStrength } from "./formOfTheDay.js";
import { playExtraTime } from "./playExtraTime.js";
import { isDerbyFor, talkEffect, type TalkTone } from "./teamTalk.js";

export type Substitution = { offId: string; onId: string };

/** What the coach changes at a minute of his match; anything left out stays as it was. */
export type LiveChange = {
  substitutions?: readonly Substitution[];
  formation?: Formation;
  posture?: Posture;
  marking?: Marking;
  play?: Play;
  penaltyTakerId?: string | null;
  /** The coach's talk in the dressing room; only at half-time, once a match. */
  talk?: TalkTone;
  /** One of the tactics his match plan keeps ready, by its place in the plan: its formation, posture, marking and play. */
  savedTactics?: number;
  /** His side's shootout order, asked for when the match ends level: changes nothing but the shootout. */
  kickerOrder?: readonly string[];
};

type Side = "home" | "away";

const benchOf = (coachMatch: CoachMatch, side: Side, coachSide: Side) => (side === coachSide ? coachMatch.bench : (coachMatch.opponentBench ?? []));

/** Who is on the pitch for each side right after `minute`: the starters, swapped by substitutions, less anyone sent off. */
function onPitch(coachMatch: CoachMatch, events: readonly MatchEvent[], side: Side, clubId: string): SimPlayer[] {
  const byId = new Map([...coachMatch.starters[side], ...coachMatch.bench, ...(coachMatch.opponentBench ?? [])].map((p) => [p.id, p]));
  let players = [...coachMatch.starters[side]];
  for (const event of events) {
    if (event.type !== "substitution" || event.clubId !== clubId) continue;
    const on = byId.get(event.playerId);
    if (on) players = players.map((p) => (p.id === event.offId ? on : p));
  }
  return players;
}

/** Throws unless every substitution follows Law 3 (its extra substitution and opportunity once extra time comes) and the bench at this minute. */
function checkSubstitutions(
  coachMatch: CoachMatch,
  kept: readonly MatchEvent[],
  eleven: readonly SimPlayer[],
  bench: readonly SimPlayer[],
  clubId: string,
  minute: number,
  subs: readonly Substitution[],
): void {
  if (!subs.length) return;
  const isExtraTime = minute >= FULL_TIME;
  const most = MAX_SUBSTITUTIONS + (isExtraTime ? EXTRA_TIME_SUBSTITUTIONS : 0);
  const mostWindows = MAX_SUBSTITUTION_WINDOWS + (isExtraTime ? EXTRA_TIME_WINDOWS : 0);
  const made = kept.filter((e) => e.type === "substitution" && e.clubId === clubId);
  if (made.length + subs.length > most) throw new Error(`a side makes at most ${most} substitutions`);
  const windows = new Set(made.filter((e) => !isFreeWindow(e.minute)).map((e) => e.minute));
  if (!isFreeWindow(minute) && !windows.has(minute) && windows.size >= mostWindows) {
    throw new Error(`a side has at most ${mostWindows} substitution windows, plus the breaks`);
  }
  const played = new Set([...coachMatch.starters.home, ...coachMatch.starters.away].map((p) => p.id));
  for (const e of made) if (e.type === "substitution") played.add(e.playerId);
  const offIds = new Set<string>();
  const onIds = new Set<string>();
  for (const { offId, onId } of subs) {
    if (!eleven.some((p) => p.id === offId) || sentOffMinute(kept, offId) !== undefined || offIds.has(offId)) throw new Error(`${offId} is not on the pitch`);
    if (!bench.some((p) => p.id === onId) || played.has(onId) || onIds.has(onId)) throw new Error(`${onId} cannot come on`);
    offIds.add(offId);
    onIds.add(onId);
  }
}

/** A Poisson count with mean `mean`, from one draw. */
function poissonCount(mean: number, random: () => number): number {
  let roll = random();
  let p = Math.exp(-mean);
  let count = 0;
  while (roll > p && count < 10) {
    roll -= p;
    count++;
    p *= mean / count;
  }
  return count;
}

/**
 * The coach's match from `minute` on, drawn again with the elevens and tactics now on the pitch:
 * cards, injuries and goals, minute by minute, then the goals' kinds and assists, missed penalties
 * and an AI side's substitutions. Each side's goals follow the engine's expected goals for the
 * whole match, spread by Série A's goal minutes and the ten-men effect; an AI side takes the
 * posture aiPosture gives it for the score at each minute, a rival human coach's side his tactics.
 */
function redraw(coachMatch: CoachMatch, match: LiveMatch, kept: readonly MatchEvent[], coachSide: Side, minute: number, random: () => number, seed: number): MatchEvent[] {
  const clubIds = { home: match.homeId, away: match.awayId };
  const elevens = { home: onPitch(coachMatch, kept, "home", clubIds.home), away: onPitch(coachMatch, kept, "away", clubIds.away) };
  const strength = (p: SimPlayer) => coachMatch.strengths[p.id] ?? p.strength;
  const hurt = new Set(kept.flatMap((e) => (e.type === "injury" ? [e.playerId] : [])));
  // As at kick-off, an injured player does nothing more in the match: no card, no goal.
  const playing = (side: Side) => elevens[side].filter((p) => sentOffMinute(kept, p.id) === undefined && !hurt.has(p.id));

  const aiSide: Side = coachSide === "home" ? "away" : "home";
  const markingOf = (side: Side) => (side === coachSide ? coachMatch.tactics : coachMatch.rivalTactics)?.marking;
  const cardRates = markedCardRates(coachMatch.cardRates, { home: markingOf("home"), away: markingOf("away") });
  const booked = new Set(kept.flatMap((e) => (e.type === "card" && e.card === "yellow" ? [e.playerId] : [])));
  // A redrawn card comes after the change, never at its minute, so it can't book a player before he comes on.
  const cards: MatchEvent[] = drawCardsAfter(minute, playing("home"), playing("away"), cardRates, booked, random).map((b) => ({
    type: "card",
    ...b,
    minute: Math.max(b.minute, minute + 1),
  }));
  const sofar = [...kept, ...cards];

  const share = (FULL_TIME - minute) / FULL_TIME;
  const injuries: MatchEvent[] = [...playing("home"), ...playing("away")].flatMap((player): MatchEvent[] => {
    if (random() >= 1 - (1 - matchInjuryChance(player, coachMatch.context)) ** share) return [];
    const { days, kind, isRecurrence } = drawInjury(player, coachMatch.context.date, injuryStreamOf(seed, match.fixtureId)(player.id));
    const earliest = Math.max(minute + 1, ...cards.flatMap((e) => (e.type === "card" && e.playerId === player.id ? [e.minute] : [])));
    const latest = sentOffMinute(sofar, player.id) ?? FULL_TIME;
    const at = earliest + Math.floor(random() * (latest - earliest + 1));
    return [{ type: "injury", minute: at, clubId: player.clubId, playerId: player.id, days, kind, ...(isRecurrence ? { isRecurrence } : {}) }];
  });
  const injuredMinute = new Map([...kept, ...injuries].flatMap((e) => (e.type === "injury" ? [[e.playerId, e.minute] as const] : [])));

  // A side's penalty taker only takes them while he is on the pitch.
  const onPitchTaker = (side: Side, tactics: Tactics): Tactics => {
    const isOn = playing(side).some((p) => p.id === tactics.penaltyTakerId);
    return { ...tactics, penaltyTakerId: isOn ? tactics.penaltyTakerId : null };
  };
  const coachTactics = onPitchTaker(coachSide, coachMatch.tactics);
  const rivalTactics = coachMatch.rivalTactics && onPitchTaker(aiSide, coachMatch.rivalTactics);
  const humanTactics = (side: Side) => (side === coachSide ? coachTactics : rivalTactics);
  const team = (side: Side, posture: Posture): Team =>
    engineTeam(clubIds[side], elevens[side], strength, humanTactics(side) ?? { ...DEFAULT_TACTICS, formation: match.formations[side], posture });
  const expected = new Map<Posture, { home: number; away: number }>();
  const expectedGoals = (aiPostureNow: Posture) => {
    const known = expected.get(aiPostureNow);
    if (known) return known;
    const odds = matchOdds(team("home", aiPostureNow), team("away", aiPostureNow), coachMatch.params);
    const goals = { home: odds.expectedHomeGoals, away: odds.expectedAwayGoals };
    expected.set(aiPostureNow, goals);
    return goals;
  };
  const reds = (side: Side) => sofar.flatMap((e) => (e.type === "card" && e.card !== "yellow" && e.clubId === clubIds[side] ? [e.minute] : []));
  const weights = { home: goalMinuteWeights(reds("home"), reds("away"), minute), away: goalMinuteWeights(reds("away"), reds("home"), minute) };
  const score = { home: 0, away: 0 };
  for (const e of kept) if (e.type === "goal") score[e.clubId === clubIds.home ? "home" : "away"]++;
  const drawn: GoalEvent[] = [];
  for (let at = minute + 1; at <= FULL_TIME; at++) {
    const lead = score[aiSide] - score[coachSide];
    const rates = expectedGoals(aiPosture(lead, at));
    for (const side of ["home", "away"] as const) {
      const count = poissonCount(rates[side] * (weights[side][at - 1] ?? 0), random);
      const scorers = elevens[side].filter((p) => (sentOffMinute(sofar, p.id) ?? Infinity) >= at && (injuredMinute.get(p.id) ?? Infinity) >= at);
      for (const playerId of scorersOf(scorers, count, random)) drawn.push({ type: "goal", minute: at, clubId: clubIds[side], playerId });
      score[side] += count;
    }
  }

  const before = [...sofar, ...injuries];
  const goalSide = (side: Side): GoalSide => ({
    clubId: clubIds[side],
    onPitch: (at) => onPitchAt(coachMatch.starters[side], benchOf(coachMatch, side, coachSide), before, clubIds[side], at),
    penaltyTakerId: humanTactics(side)?.penaltyTakerId ?? null,
  });
  const sides = { home: goalSide("home"), away: goalSide("away") };
  const goals = describeGoals(drawn, sides, strength, random);
  const misses = drawPenaltyMisses(sides, strength, minute, () => drawMinute(goalMinuteWeights([], [], minute), random), random);
  const allGoals = [...kept.filter((e): e is GoalEvent => e.type === "goal"), ...goals];
  const goalDifferenceAt = (at: number) => allGoals.reduce((diff, g) => (g.minute < at ? diff + (g.clubId === clubIds[aiSide] ? 1 : -1) : diff), 0);
  const aiSubs = rivalTactics
    ? []
    : aiSubstitutions(
        { clubId: clubIds[aiSide], starters: coachMatch.starters[aiSide], bench: benchOf(coachMatch, aiSide, coachSide), tiredness: (p) => tirednessOn(p, coachMatch.context.date) },
        [...before, ...goals, ...misses],
        minute,
        goalDifferenceAt,
        random,
      );
  return [...cards, ...injuries, ...goals, ...misses, ...aiSubs];
}

/** The shootout of the coach's match when its new score sends it to penalties, played on the match's own stream. */
function shootoutAfter(live: LiveDay, coachMatch: CoachMatch, match: LiveMatch, events: readonly MatchEvent[], coachSide: Side, random: () => number): MatchEvent[] {
  const fixture = live.state.fixtures.find((f) => f.id === match.fixtureId);
  if (!fixture) return [];
  const goals = (clubId: string) => events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
  const result = { homeGoals: goals(match.homeId), awayGoals: goals(match.awayId) };
  const competition = live.state.competitions[fixture.competitionId];
  if (!isShootoutDue(live.state, { ...fixture, result }) || (competition && tieBreakOf(competition, fixture.stage) === "betterSeed")) return [];
  const end = matchEndOf(events);
  const strength = (p: SimPlayer) => coachMatch.strengths[p.id] ?? p.strength;
  const side = (s: Side) => {
    const clubId = s === "home" ? match.homeId : match.awayId;
    const order = s === coachSide ? coachMatch.tactics.kickerOrder : coachMatch.rivalTactics?.kickerOrder;
    return {
      clubId,
      onPitch: onPitchAt(coachMatch.starters[s], benchOf(coachMatch, s, coachSide), events, clubId, end + 1),
      morale: clubMood(live.state, clubId).squad,
      ...(order ? { order } : {}),
    };
  };
  return settleShootout({ ...fixture, result }, shootoutSeed(random), side("home"), side("away"), strength, end === EXTRA_TIME_END ? EXTRA_TIME_END : FULL_TIME).events;
}

/**
 * Extra time of the coach's match after `from`, drawn on the match's stream, when it is under way
 * already (`from` 90 or later) or the tie is level after the ninety minutes and its competition plays
 * it; null when the match ends at ninety minutes. Each side's goals follow the engine's expected goals
 * for the elevens and tactics on the pitch, an AI side at the posture aiPosture gives it then.
 */
function extraTimeAfter(live: LiveDay, coachMatch: CoachMatch, match: LiveMatch, events: readonly MatchEvent[], coachSide: Side, from: number, random: () => number): MatchEvent[] | null {
  const fixture = live.state.fixtures.find((f) => f.id === match.fixtureId);
  const competition = fixture && live.state.competitions[fixture.competitionId];
  if (!fixture || !competition) return null;
  const goals = (clubId: string) => events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
  if (from < FULL_TIME) {
    const result = { homeGoals: goals(match.homeId), awayGoals: goals(match.awayId) };
    if (!isShootoutDue(live.state, { ...fixture, result }) || tieBreakOf(competition, fixture.stage) !== "extraTime") return null;
  }
  const start = Math.max(from, FULL_TIME);
  const clubIds = { home: match.homeId, away: match.awayId };
  const aiSide: Side = coachSide === "home" ? "away" : "home";
  const strength = (p: SimPlayer) => coachMatch.strengths[p.id] ?? p.strength;
  const humanTactics = (side: Side) => (side === coachSide ? coachMatch.tactics : coachMatch.rivalTactics);
  const lead = goals(clubIds[aiSide]) - goals(clubIds[coachSide]);
  const team = (side: Side): Team =>
    engineTeam(clubIds[side], onPitch(coachMatch, events, side, clubIds[side]), strength, humanTactics(side) ?? { ...DEFAULT_TACTICS, formation: match.formations[side], posture: aiPosture(lead, start + 1) });
  const markingOf = (side: Side) => humanTactics(side)?.marking;
  const benches = { home: benchOf(coachMatch, "home", coachSide), away: benchOf(coachMatch, "away", coachSide) };
  const extraTime = {
    clubIds,
    starters: coachMatch.starters,
    benches,
    aiSides: { home: coachSide !== "home" && !coachMatch.rivalTactics, away: coachSide !== "away" && !coachMatch.rivalTactics },
    penaltyTakers: { home: humanTactics("home")?.penaltyTakerId ?? null, away: humanTactics("away")?.penaltyTakerId ?? null },
    strength,
    tiredness: (p: SimPlayer) => tirednessOn(p, coachMatch.context.date),
    teams: { home: team("home"), away: team("away") },
    params: coachMatch.params,
    cardRates: markedCardRates(coachMatch.cardRates, { home: markingOf("home"), away: markingOf("away") }),
    context: coachMatch.context,
    injuryStream: injuryStreamOf(live.state.seed, match.fixtureId),
  };
  return playExtraTime(extraTime, events, random, start);
}

/** What the referee's calls of the coach's match need: its officials, and who is on the pitch for each side at each minute. */
function refereeOf(live: LiveDay, coachMatch: CoachMatch, match: LiveMatch, events: readonly MatchEvent[], coachSide: Side) {
  const fixture = live.state.fixtures.find((f) => f.id === match.fixtureId);
  const competition = fixture && live.state.competitions[fixture.competitionId];
  const officials = fixture && competition ? matchOfficials(live.state.seed, competition, fixture) : { referee: null, strictness: 1, var: null };
  const side = (s: Side) => {
    const clubId = s === "home" ? match.homeId : match.awayId;
    return { clubId, onPitch: (minute: number) => onPitchAt(coachMatch.starters[s], benchOf(coachMatch, s, coachSide), events, clubId, minute) };
  };
  return { seed: live.state.seed, fixtureId: match.fixtureId, officials, home: side("home"), away: side("away") };
}

/**
 * The open match after `clubId`'s coach talked to his side at half-time with `talk`: each of his players
 * plays the second half at the strength the talk's form shift gives him.
 */
function withHalfTimeTalk(live: LiveDay, coachMatch: CoachMatch, match: LiveMatch, kept: readonly MatchEvent[], clubId: string, talk: TalkTone): CoachMatch {
  if (coachMatch.halfTimeTalks?.[clubId]) throw new Error(`${clubId} already talked at half-time`);
  const goals = (own: boolean) => kept.filter((e) => e.type === "goal" && (e.clubId === clubId) === own).length;
  const effect = talkEffect(talk, { lead: goals(true) - goals(false), morale: clubMood(live.state, clubId).squad, isDerby: isDerbyFor(live.state, match, clubId) });
  const lift = formStrength(effect.form);
  // The side's own players as the match fields them: a national team's are the game's players called up, its for the day.
  const own = new Set([...coachMatch.starters.home, ...coachMatch.starters.away, ...coachMatch.bench, ...(coachMatch.opponentBench ?? [])].filter((p) => p.clubId === clubId).map((p) => p.id));
  const strengths = Object.fromEntries(Object.entries(coachMatch.strengths).map(([id, strength]) => [id, own.has(id) ? strength + lift : strength]));
  return { ...coachMatch, strengths, halfTimeTalks: { ...coachMatch.halfTimeTalks, [clubId]: { tone: talk, ...effect } } };
}

/** The open match a human coach's club plays today: the seated coach's, or a waiting coach's in a hot-seat game. */
function openMatchOf(live: LiveDay, clubId: string): CoachMatch | undefined {
  const plays = (open: CoachMatch) => live.matches.some((m) => m.fixtureId === open.fixtureId && (m.homeId === clubId || m.awayId === clubId));
  return [live.coachMatch, ...(live.waitingMatches ?? [])].find((open): open is CoachMatch => open !== null && open !== undefined && plays(open));
}

/**
 * The side's tactics with a saved tactics of the changing coach's match plan put on whole: its formation,
 * posture, marking and play, a marking or play it leaves out (the usual heavy marking, a mixed play)
 * taking off the one on the pitch. The penalty taker and shootout order stay.
 */
function withSavedTactics(live: LiveDay, clubId: string, index: number, before: Tactics): Tactics {
  const saved = planOfClub(live.state, clubId)?.savedTactics?.[index];
  if (!saved) throw new Error(`${clubId}'s match plan has no saved tactics ${index + 1}`);
  return {
    formation: saved.formation,
    posture: saved.posture,
    penaltyTakerId: before.penaltyTakerId,
    ...(before.kickerOrder ? { kickerOrder: before.kickerOrder } : {}),
    ...(saved.marking ? { marking: saved.marking } : {}),
    ...(saved.play ? { play: saved.play } : {}),
  };
}

// What the house rule "manual changes only in finals" still lets a coach do in other matches: talk at half-time, and pick a tactics his plan keeps ready.
const PLAN_CHANGES: ReadonlySet<keyof LiveChange> = new Set(["talk", "savedTactics"]);

/** Who makes a change: the coach himself, or his match plan, which never moves the minute his own changes come from. */
type ChangeBy = "coach" | "plan";

const isReplayed = (e: MatchEvent) => !isWhistle(e) && e.type !== "shootoutKick" && e.type !== "orderOverruled" && e.type !== "varCheck" && e.type !== "wrongCall";

function changeMatch(live: LiveDay, minute: number, change: LiveChange, clubId: string | null, by: ChangeBy): LiveDay {
  const coachMatch = clubId === null ? undefined : openMatchOf(live, clubId);
  if (!coachMatch || !clubId) throw new Error("the coach has no match today");
  const match = live.matches.find((m) => m.fixtureId === coachMatch.fixtureId);
  if (!match) throw new Error(`coach's match ${coachMatch.fixtureId} has no timeline`);
  const end = matchEndOf(match.events);
  const fixture = live.state.fixtures.find((f) => f.id === match.fixtureId);
  const isManual = (Object.keys(change) as (keyof LiveChange)[]).some((key) => change[key] !== undefined && !PLAN_CHANGES.has(key));
  if (by === "coach" && isManual && fixture && isLockedToPlans(live.state, fixture)) throw new Error("the house rule allows changes during a match only in finals");
  if (change.kickerOrder) return withKickerOrder(live, coachMatch, match, minute, clubId, change.kickerOrder);
  if (!Number.isInteger(minute) || minute < coachMatch.lastChangeMinute || minute >= end) {
    throw new Error(`a change must come between minute ${coachMatch.lastChangeMinute} and ${end - 1}`);
  }
  const ownerId = coachMatch.clubId ?? live.state.coachClubId;
  const ownerSide: Side = match.homeId === ownerId ? "home" : "away";
  const changingSide: Side = match.homeId === clubId ? "home" : "away";
  const isRival = changingSide !== ownerSide;
  const before = isRival ? coachMatch.rivalTactics : coachMatch.tactics;
  if (!before) throw new Error(`${clubId} has no coach in match ${coachMatch.fixtureId}`);
  const base = change.savedTactics === undefined ? before : withSavedTactics(live, clubId, change.savedTactics, before);
  // The referee's calls are told again over the whole new timeline; they never shape what is drawn.
  const kept = match.events.filter((e) => e.minute <= minute && isReplayed(e));
  const subs = change.substitutions ?? [];
  const bench = benchOf(coachMatch, changingSide, ownerSide);
  checkSubstitutions(coachMatch, kept, onPitch(coachMatch, kept, changingSide, clubId), bench, clubId, minute, subs);
  const substitutions: MatchEvent[] = subs.map(({ offId, onId }) => ({ type: "substitution", minute, clubId, playerId: onId, offId, ...(by === "plan" ? { byPlan: true as const } : {}) }));
  const tactics: Tactics = {
    ...base,
    formation: change.formation ?? base.formation,
    posture: change.posture ?? base.posture,
    ...(change.marking ?? base.marking ? { marking: change.marking ?? base.marking } : {}),
    ...(change.play ?? base.play ? { play: change.play ?? base.play } : {}),
    penaltyTakerId: change.penaltyTakerId === undefined ? base.penaltyTakerId : change.penaltyTakerId,
  };
  if (change.talk && minute !== HALF_TIME) throw new Error("a team talk comes at half-time");
  const random = randomStream(coachMatch.rngState);
  const lastChangeMinute = by === "coach" ? minute : coachMatch.lastChangeMinute;
  // The plan's answers after a coach's change go with the timeline it redraws, and come again from the plan.
  const answeredByPlan = by === "coach" ? coachMatch.answeredByPlan?.filter((answer) => answer.minute <= minute) : coachMatch.answeredByPlan;
  const redrawing: CoachMatch = { ...coachMatch, lastChangeMinute, isChanged: true, ...(answeredByPlan?.length ? { answeredByPlan } : {}) };
  if (!answeredByPlan?.length) delete redrawing.answeredByPlan;
  const changed: CoachMatch = isRival ? { ...redrawing, rivalTactics: tactics } : { ...redrawing, tactics };
  const next = change.talk ? withHalfTimeTalk(live, changed, match, kept, clubId, change.talk) : changed;
  const sofar = [...kept, ...substitutions];
  const ninety = [...sofar, ...(minute < FULL_TIME ? redraw(next, match, sofar, ownerSide, minute, random.next, live.state.seed) : [])];
  const extraTime = extraTimeAfter(live, next, match, ninety, ownerSide, minute, random.next);
  const played = [...ninety, ...(extraTime ?? [])];
  const shootout = shootoutAfter(live, next, match, [...played, ...whistlesTo(extraTime ? EXTRA_TIME_END : FULL_TIME)], ownerSide, random.next);
  const timeline = inMatchOrder([...played, ...whistlesTo(extraTime ? EXTRA_TIME_END : FULL_TIME), ...shootout]);
  const events = withRefereeCalls(timeline, refereeOf(live, next, match, timeline, ownerSide));
  const formations = { ...match.formations, [changingSide]: tactics.formation };
  const redrawn: CoachMatch = { ...next, rngState: random.state() };
  return withOpenMatch(live, coachMatch, redrawn, live.matches.map((m) => (m === match ? { ...match, formations, events } : m)));
}

/** The day with one of its open matches replaced, and its timelines when they changed too. */
function withOpenMatch(live: LiveDay, before: CoachMatch, after: CoachMatch, matches: LiveMatch[] = live.matches): LiveDay {
  if (before === live.coachMatch) return { ...live, matches, coachMatch: after };
  return { ...live, matches, waitingMatches: (live.waitingMatches ?? []).map((open) => (open === before ? after : open)) };
}

/**
 * The coach's match after he set his side's shootout order once it ended level: the shootout kicked again
 * in that order on the match's own stream, everything before it as it was.
 */
function withKickerOrder(live: LiveDay, coachMatch: CoachMatch, match: LiveMatch, minute: number, clubId: string, order: readonly string[]): LiveDay {
  const end = matchEndOf(match.events);
  if (minute !== end || !match.events.some((e) => e.type === "shootoutKick")) throw new Error("a shootout order comes when the match ends level, before its shootout");
  if (coachMatch.lastChangeMinute === end) throw new Error("a shootout order is given once");
  const ownerId = coachMatch.clubId ?? live.state.coachClubId;
  const ownerSide: Side = match.homeId === ownerId ? "home" : "away";
  const isRival = (match.homeId === clubId ? "home" : "away") !== ownerSide;
  const before = isRival ? coachMatch.rivalTactics : coachMatch.tactics;
  if (!before) throw new Error(`${clubId} has no coach in match ${coachMatch.fixtureId}`);
  const tactics: Tactics = { ...before, kickerOrder: order };
  const changed: CoachMatch = { ...coachMatch, ...(isRival ? { rivalTactics: tactics } : { tactics }), lastChangeMinute: minute, isChanged: true };
  const played = match.events.filter((e) => e.type !== "shootoutKick" && e.type !== "orderOverruled");
  const random = randomStream(coachMatch.rngState);
  const shootout = shootoutAfter(live, changed, match, played, ownerSide, random.next);
  const events = inMatchOrder([...played, ...shootout]);
  return withOpenMatch(live, coachMatch, { ...changed, rngState: random.state() }, live.matches.map((m) => (m === match ? { ...match, events } : m)));
}

/** The open matches of the day, by fixture: the seated coach's and the waiting coaches'. */
const openMatches = (live: LiveDay): CoachMatch[] => [live.coachMatch, ...(live.waitingMatches ?? [])].filter((open): open is CoachMatch => open !== null);

/** Each human coach's side of an open match whose plan has a rule to follow during it. */
function planSidesOf(live: LiveDay, open: CoachMatch, match: LiveMatch): PlanSide[] {
  const ownerId = open.clubId ?? live.state.coachClubId;
  return (["home", "away"] as const).flatMap((side): PlanSide[] => {
    const clubId = side === "home" ? match.homeId : match.awayId;
    const plan = planOfClub(live.state, clubId);
    if (!plan || !isPlanActive(plan)) return [];
    const bench = clubId === ownerId ? open.bench : (open.opponentBench ?? []);
    return [{ clubId, plan, starters: open.starters[side], bench, strength: (p) => open.strengths[p.id] ?? p.strength, date: open.context.date }];
  });
}

/** The human coaches' plans in one open match after minute `from`: each move in minute order, the match drawn again after each substitution. */
function followPlansIn(live: LiveDay, fixtureId: string, from: number): LiveDay {
  let day = live;
  const done = new Map<string, number>();
  for (;;) {
    const open = openMatches(day).find((m) => m.fixtureId === fixtureId);
    const match = day.matches.find((m) => m.fixtureId === fixtureId);
    if (!open || !match) return day;
    const end = matchEndOf(match.events);
    let next: { clubId: string; move: PlanMove } | null = null;
    for (const side of planSidesOf(day, open, match)) {
      const move = nextPlanMove(side, match.events, done.get(side.clubId) ?? from, end);
      if (move && (!next || move.minute < next.move.minute)) next = { clubId: side.clubId, move };
    }
    if (!next) return day;
    const { clubId, move } = next;
    done.set(clubId, move.minute);
    const moved = move.substitutions.length ? changeMatch(day, move.minute, { substitutions: move.substitutions }, clubId, "plan") : day;
    const after = openMatches(moved).find((m) => m.fixtureId === fixtureId);
    if (!after) return moved;
    const answeredByPlan = [...(after.answeredByPlan ?? []), ...move.answered.map((answer) => ({ ...answer, clubId }))];
    day = answeredByPlan.length ? withOpenMatch(moved, after, { ...after, answeredByPlan }) : moved;
  }
}

/** Every open match after minute `from`, as the human coaches' match plans play it (planSubstitutions.ts). */
export function followMatchPlans(live: LiveDay, from: number): LiveDay {
  return openMatches(live).reduce((day, open) => followPlansIn(day, open.fixtureId, from), live);
}

/**
 * A human coach changes his side at `minute` of his match: substitutions, formation, posture,
 * marking, play, penalty taker, one of his plan's saved tactics or, at half-time, his talk; when it
 * ends level before a shootout, his kickers' order. Everything up to that minute stays; the rest of
 * his match is drawn again, and the coaches' plans in it followed again. The day's other matches are
 * untouched. Changes come in minute order. The coach is the one in the seat, for the side he runs today,
 * unless `clubId` names another of his sides or a hot-seat coach waiting for his turn. Under the house
 * rule "manual changes only in finals", a match that isn't a final takes only his talk and his saved tactics.
 */
export function applyLiveChange(live: LiveDay, minute: number, change: LiveChange, clubId: string | null = live.coachMatch?.clubId ?? live.state.coachClubId): LiveDay {
  const changed = changeMatch(live, minute, change, clubId, "coach");
  const fixtureId = clubId === null ? undefined : openMatchOf(changed, clubId)?.fixtureId;
  return fixtureId ? followPlansIn(changed, fixtureId, minute) : changed;
}
