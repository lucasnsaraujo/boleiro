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
import { aiSubstitutions, MAX_SUBSTITUTION_WINDOWS, MAX_SUBSTITUTIONS, onPitchAt, tirednessOn } from "./aiSubstitutions.js";
import { describeGoals, drawPenaltyMisses, type GoalEvent, type GoalSide } from "./goalDetails.js";
import type { CoachMatch, LiveDay, LiveMatch } from "./liveDay.js";
import { drawMinute, FULL_TIME, HALF_TIME, goalMinuteWeights, inMatchOrder, sentOffMinute, type MatchEvent } from "./matchTimeline.js";

export type Substitution = { offId: string; onId: string };

/** What the coach changes at a minute of his match; anything left out stays as it was. */
export type LiveChange = {
  substitutions?: readonly Substitution[];
  formation?: Formation;
  posture?: Posture;
  marking?: Marking;
  play?: Play;
  penaltyTakerId?: string | null;
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

/** Throws unless every substitution follows Law 3 and the bench at this minute. */
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
  const made = kept.filter((e) => e.type === "substitution" && e.clubId === clubId);
  if (made.length + subs.length > MAX_SUBSTITUTIONS) throw new Error(`a side makes at most ${MAX_SUBSTITUTIONS} substitutions`);
  const windows = new Set(made.filter((e) => e.minute !== HALF_TIME).map((e) => e.minute));
  if (minute !== HALF_TIME && !windows.has(minute) && windows.size >= MAX_SUBSTITUTION_WINDOWS) {
    throw new Error(`a side has at most ${MAX_SUBSTITUTION_WINDOWS} substitution windows, plus half-time`);
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
  if (!isShootoutDue(live.state, { ...fixture, result })) return [];
  const strength = (p: SimPlayer) => coachMatch.strengths[p.id] ?? p.strength;
  const side = (s: Side) => {
    const clubId = s === "home" ? match.homeId : match.awayId;
    const order = s === coachSide ? coachMatch.tactics.kickerOrder : coachMatch.rivalTactics?.kickerOrder;
    return {
      clubId,
      onPitch: onPitchAt(coachMatch.starters[s], benchOf(coachMatch, s, coachSide), events, clubId, FULL_TIME + 1),
      morale: clubMood(live.state, clubId).squad,
      ...(order ? { order } : {}),
    };
  };
  return settleShootout({ ...fixture, result }, shootoutSeed(random), side("home"), side("away"), strength).events;
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

/** The open match a human coach's club plays today: the seated coach's, or a waiting coach's in a hot-seat game. */
function openMatchOf(live: LiveDay, clubId: string): CoachMatch | undefined {
  const plays = (open: CoachMatch) => live.matches.some((m) => m.fixtureId === open.fixtureId && (m.homeId === clubId || m.awayId === clubId));
  return [live.coachMatch, ...(live.waitingMatches ?? [])].find((open): open is CoachMatch => open !== null && open !== undefined && plays(open));
}

/**
 * A human coach changes his side at `minute` of his match: substitutions, formation, posture,
 * marking, play or penalty taker. Everything up to that minute stays; the rest of his match is drawn again. The day's
 * other matches are untouched. Changes come in minute order. The coach is the one in the seat unless
 * `clubId` names a hot-seat coach waiting for his turn.
 */
export function applyLiveChange(live: LiveDay, minute: number, change: LiveChange, clubId: string | null = live.state.coachClubId): LiveDay {
  const coachMatch = clubId === null ? undefined : openMatchOf(live, clubId);
  if (!coachMatch || !clubId) throw new Error("the coach has no match today");
  if (!Number.isInteger(minute) || minute < coachMatch.lastChangeMinute || minute >= FULL_TIME) {
    throw new Error(`a change must come between minute ${coachMatch.lastChangeMinute} and ${FULL_TIME - 1}`);
  }
  const match = live.matches.find((m) => m.fixtureId === coachMatch.fixtureId);
  if (!match) throw new Error(`coach's match ${coachMatch.fixtureId} has no timeline`);
  const ownerId = coachMatch.clubId ?? live.state.coachClubId;
  const ownerSide: Side = match.homeId === ownerId ? "home" : "away";
  const changingSide: Side = match.homeId === clubId ? "home" : "away";
  const isRival = changingSide !== ownerSide;
  const before = isRival ? coachMatch.rivalTactics : coachMatch.tactics;
  if (!before) throw new Error(`${clubId} has no coach in match ${coachMatch.fixtureId}`);
  // The referee's calls are told again over the whole new timeline; they never shape what is drawn.
  const isReplayed = (e: MatchEvent) => e.type !== "halfTime" && e.type !== "fullTime" && e.type !== "shootoutKick" && e.type !== "orderOverruled" && e.type !== "varCheck" && e.type !== "wrongCall";
  const kept = match.events.filter((e) => e.minute <= minute && isReplayed(e));
  const subs = change.substitutions ?? [];
  const bench = benchOf(coachMatch, changingSide, ownerSide);
  checkSubstitutions(coachMatch, kept, onPitch(coachMatch, kept, changingSide, clubId), bench, clubId, minute, subs);
  const substitutions: MatchEvent[] = subs.map(({ offId, onId }) => ({ type: "substitution", minute, clubId, playerId: onId, offId }));
  const tactics: Tactics = {
    ...before,
    formation: change.formation ?? before.formation,
    posture: change.posture ?? before.posture,
    ...(change.marking ?? before.marking ? { marking: change.marking ?? before.marking } : {}),
    ...(change.play ?? before.play ? { play: change.play ?? before.play } : {}),
    penaltyTakerId: change.penaltyTakerId === undefined ? before.penaltyTakerId : change.penaltyTakerId,
  };
  const random = randomStream(coachMatch.rngState);
  const next: CoachMatch = isRival ? { ...coachMatch, rivalTactics: tactics, lastChangeMinute: minute, isChanged: true } : { ...coachMatch, tactics, lastChangeMinute: minute, isChanged: true };
  const sofar = [...kept, ...substitutions];
  const after = redraw(next, match, sofar, ownerSide, minute, random.next, live.state.seed);
  const played = [...sofar, ...after];
  const shootout = shootoutAfter(live, next, match, played, ownerSide, random.next);
  const timeline = inMatchOrder([...played, { type: "halfTime", minute: HALF_TIME }, { type: "fullTime", minute: FULL_TIME }, ...shootout]);
  const events = withRefereeCalls(timeline, refereeOf(live, next, match, timeline, ownerSide));
  const formations = { ...match.formations, [changingSide]: tactics.formation };
  const redrawn: CoachMatch = { ...next, rngState: random.state() };
  const matches = live.matches.map((m) => (m === match ? { ...match, formations, events } : m));
  if (coachMatch === live.coachMatch) return { ...live, matches, coachMatch: redrawn };
  return { ...live, matches, waitingMatches: (live.waitingMatches ?? []).map((open) => (open === coachMatch ? redrawn : open)) };
}
