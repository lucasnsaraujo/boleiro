import type { Formation } from "../../engine/formations.js";
import { matchOdds, type Posture, type Team } from "../../engine/match.js";
import { randomStream } from "../../engine/random.js";
import { aiPosture, type Tactics } from "../coach/tactics.js";
import { drawCardsAfter } from "../discipline/drawCards.js";
import type { SimPlayer } from "../gameState.js";
import { scorersOf } from "../history/scorersOf.js";
import { injuryLayoffDays, matchInjuryChance } from "../players/matchInjuryChance.js";
import { engineTeam } from "../players/matchSetup.js";
import type { CoachMatch, LiveDay, LiveMatch } from "./liveDay.js";
import { FULL_TIME, HALF_TIME, goalMinuteWeights, inMatchOrder, sentOffMinute, type MatchEvent } from "./matchTimeline.js";

export type Substitution = { offId: string; onId: string };

/** What the coach changes at a minute of his match; anything left out stays as it was. */
export type LiveChange = {
  substitutions?: readonly Substitution[];
  formation?: Formation;
  posture?: Posture;
  penaltyTakerId?: string | null;
};

// IFAB Laws of the Game 2025/26, Law 3.1: up to five substitutes, used in at most three
// opportunities during the match; substitutions at half-time do not use one.
const MAX_SUBSTITUTIONS = 5;
const MAX_SUBSTITUTION_WINDOWS = 3;

type Side = "home" | "away";

/** Who is on the pitch for each side right after `minute`: the starters, swapped by substitutions, less anyone sent off. */
function onPitch(coachMatch: CoachMatch, events: readonly MatchEvent[], side: Side, clubId: string): SimPlayer[] {
  const byId = new Map([...coachMatch.starters[side], ...coachMatch.bench].map((p) => [p.id, p]));
  let players = [...coachMatch.starters[side]];
  for (const event of events) {
    if (event.type !== "substitution" || event.clubId !== clubId) continue;
    const on = byId.get(event.playerId);
    if (on) players = players.map((p) => (p.id === event.offId ? on : p));
  }
  return players;
}

/** Throws unless every substitution follows Law 3 and the bench at this minute. */
function checkSubstitutions(coachMatch: CoachMatch, kept: readonly MatchEvent[], eleven: readonly SimPlayer[], clubId: string, minute: number, subs: readonly Substitution[]): void {
  if (!subs.length) return;
  const made = kept.filter((e) => e.type === "substitution" && e.clubId === clubId);
  if (made.length + subs.length > MAX_SUBSTITUTIONS) throw new Error(`a side makes at most ${MAX_SUBSTITUTIONS} substitutions`);
  const windows = new Set(made.filter((e) => e.minute !== HALF_TIME).map((e) => e.minute));
  if (minute !== HALF_TIME && !windows.has(minute) && windows.size >= MAX_SUBSTITUTION_WINDOWS) {
    throw new Error(`a side has at most ${MAX_SUBSTITUTION_WINDOWS} substitution windows, plus half-time`);
  }
  const played = new Set([...coachMatch.starters.home, ...coachMatch.starters.away].map((p) => p.id));
  for (const e of made) if (e.type === "substitution") played.add(e.playerId);
  const onIds = new Set<string>();
  for (const { offId, onId } of subs) {
    if (!eleven.some((p) => p.id === offId) || sentOffMinute(kept, offId) !== undefined) throw new Error(`${offId} is not on the pitch`);
    if (!coachMatch.bench.some((p) => p.id === onId) || played.has(onId) || onIds.has(onId)) throw new Error(`${onId} cannot come on`);
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
 * cards, injuries and goals, minute by minute. Each side's goals follow the engine's expected goals
 * for the whole match, spread by Série A's goal minutes and the ten-men effect; the AI side takes
 * the posture aiPosture gives it for the score at each minute.
 */
function redraw(coachMatch: CoachMatch, match: LiveMatch, kept: readonly MatchEvent[], coachSide: Side, minute: number, random: () => number): MatchEvent[] {
  const clubIds = { home: match.homeId, away: match.awayId };
  const elevens = { home: onPitch(coachMatch, kept, "home", clubIds.home), away: onPitch(coachMatch, kept, "away", clubIds.away) };
  const strength = (p: SimPlayer) => coachMatch.strengths[p.id] ?? p.strength;
  const playing = (side: Side) => elevens[side].filter((p) => sentOffMinute(kept, p.id) === undefined);

  const booked = new Set(kept.flatMap((e) => (e.type === "card" && e.card === "yellow" ? [e.playerId] : [])));
  const cards: MatchEvent[] = drawCardsAfter(minute, playing("home"), playing("away"), coachMatch.cardRates, booked, random).map((b) => ({ type: "card", ...b }));
  const sofar = [...kept, ...cards];

  const share = (FULL_TIME - minute) / FULL_TIME;
  const hurt = new Set(kept.flatMap((e) => (e.type === "injury" ? [e.playerId] : [])));
  const injuries: MatchEvent[] = [...playing("home"), ...playing("away")].flatMap((player): MatchEvent[] => {
    if (hurt.has(player.id) || random() >= 1 - (1 - matchInjuryChance(player, coachMatch.context)) ** share) return [];
    const days = injuryLayoffDays(random);
    const latest = sentOffMinute(sofar, player.id) ?? FULL_TIME;
    const at = Math.min(latest, minute + 1 + Math.floor(random() * (FULL_TIME - minute)));
    return [{ type: "injury", minute: at, clubId: player.clubId, playerId: player.id, days }];
  });

  const aiSide: Side = coachSide === "home" ? "away" : "home";
  const team = (side: Side, posture: Posture): Team =>
    side === coachSide ? engineTeam(clubIds[side], elevens[side], strength, coachMatch.tactics) : { ...engineTeam(clubIds[side], elevens[side], strength), posture };
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
  const goals: MatchEvent[] = [];
  for (let at = minute + 1; at <= FULL_TIME; at++) {
    const lead = score[aiSide] - score[coachSide];
    const rates = expectedGoals(aiPosture(lead, at));
    for (const side of ["home", "away"] as const) {
      const count = poissonCount(rates[side] * (weights[side][at - 1] ?? 0), random);
      const scorers = elevens[side].filter((p) => (sentOffMinute(sofar, p.id) ?? Infinity) >= at);
      for (const playerId of scorersOf(scorers, count, random)) goals.push({ type: "goal", minute: at, clubId: clubIds[side], playerId });
      score[side] += count;
    }
  }
  return [...cards, ...injuries, ...goals];
}

/**
 * The coach changes his side at `minute` of his match: substitutions, formation, posture or penalty
 * taker. Everything up to that minute stays; the rest of his match is drawn again. The day's other
 * matches are untouched. Changes come in minute order.
 */
export function applyLiveChange(live: LiveDay, minute: number, change: LiveChange): LiveDay {
  const { coachMatch } = live;
  const clubId = live.state.coachClubId;
  if (!coachMatch || !clubId) throw new Error("the coach has no match today");
  if (!Number.isInteger(minute) || minute < coachMatch.lastChangeMinute || minute >= FULL_TIME) {
    throw new Error(`a change must come between minute ${coachMatch.lastChangeMinute} and ${FULL_TIME - 1}`);
  }
  const match = live.matches.find((m) => m.fixtureId === coachMatch.fixtureId);
  if (!match) throw new Error(`coach's match ${coachMatch.fixtureId} has no timeline`);
  const coachSide: Side = match.homeId === clubId ? "home" : "away";
  const kept = match.events.filter((e) => e.minute <= minute && e.type !== "halfTime" && e.type !== "fullTime");
  const subs = change.substitutions ?? [];
  checkSubstitutions(coachMatch, kept, onPitch(coachMatch, kept, coachSide, clubId), clubId, minute, subs);
  const substitutions: MatchEvent[] = subs.map(({ offId, onId }) => ({ type: "substitution", minute, clubId, playerId: onId, offId }));
  const tactics: Tactics = {
    formation: change.formation ?? coachMatch.tactics.formation,
    posture: change.posture ?? coachMatch.tactics.posture,
    penaltyTakerId: change.penaltyTakerId === undefined ? coachMatch.tactics.penaltyTakerId : change.penaltyTakerId,
  };
  const random = randomStream(coachMatch.rngState);
  const next: CoachMatch = { ...coachMatch, tactics, lastChangeMinute: minute, isChanged: true };
  const before = [...kept, ...substitutions];
  const after = redraw(next, match, before, coachSide, minute, random.next);
  const events = inMatchOrder([...before, ...after, { type: "halfTime", minute: HALF_TIME }, { type: "fullTime", minute: FULL_TIME }]);
  const formations = { ...match.formations, [coachSide]: tactics.formation };
  return {
    ...live,
    matches: live.matches.map((m) => (m === match ? { ...match, formations, events } : m)),
    coachMatch: { ...next, rngState: random.state() },
  };
}
