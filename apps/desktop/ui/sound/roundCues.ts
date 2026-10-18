import { EXTRA_HALF_TIME, FULL_TIME, HALF_TIME, type MatchEvent } from "@boleiro/engine/sim/live/matchTimeline";
import type { VarCheck } from "@boleiro/engine/sim/referees/refereeCalls";
import type { LiveRound, RoundMatch, Side } from "@boleiro/game-client/round/liveRoundOf";
import { roundEndOf } from "../round/roundAt.js";
import { CUES, type Cue } from "./soundCatalog.js";

const humanClubIdsOf = (round: LiveRound) => new Set(round.coachClubId === null ? [] : [round.coachClubId, ...(round.otherHumanClubIds ?? [])]);

/**
 * The sounds of a human coach's match in the minutes after `from` up to `to`, `humans` being the human
 * coaches' clubs in it: goals heard from the side of whoever of them it concerns (a goal between two humans
 * celebrates its scorer), penalties, cards and injuries.
 */
function humanMatchCues(match: RoundMatch, humans: ReadonlySet<string>, from: number, to: number): Cue[] {
  const cues: Cue[] = [];
  const isNew = (minute: number) => minute > from && minute <= to;
  const goals = new Map<string, number>();
  const hasTrailed = new Set<string>();
  const hasComeBack = new Set<string>();
  const otherOf = (clubId: string) => (clubId === match.homeId ? match.awayId : match.homeId);
  for (const event of match.events) {
    if (event.minute > to) break;
    if (event.type === "goal") {
      const scored = (goals.get(event.clubId) ?? 0) + 1;
      goals.set(event.clubId, scored);
      const against = goals.get(otherOf(event.clubId)) ?? 0;
      const isComeback = humans.has(event.clubId) && hasTrailed.has(event.clubId) && !hasComeBack.has(event.clubId) && scored === against + 1;
      if (isComeback) hasComeBack.add(event.clubId);
      if (against > scored) hasTrailed.add(event.clubId);
      if (scored > against) hasTrailed.add(otherOf(event.clubId));
      if (!isNew(event.minute)) continue;
      if (event.kind === "penalty") cues.push("penalty");
      cues.push(!humans.has(event.clubId) ? "conceded" : isComeback ? "comeback" : "coachGoal");
      continue;
    }
    if (!isNew(event.minute)) continue;
    if (event.type === "penaltyMiss") cues.push("penalty", humans.has(event.clubId) ? "groan" : "relief");
    if (event.type === "card") cues.push(event.card === "yellow" ? "card" : "redCard");
    if (event.type === "injury") cues.push("injury");
  }
  return cues;
}

/**
 * The sounds of the minutes after `from` up to `to`: whistles (extra time's breaks whistled as half-time),
 * every goal of the round, and what happens in the human coaches' matches. A match VAR is checking at `to`
 * (`heldFixtureId`) keeps that minute's sounds back for the decision.
 */
export function roundCues(round: LiveRound, from: number, to: number, heldFixtureId: string | null = null): Cue[] {
  const cues: Cue[] = [];
  const isNew = (minute: number) => minute > from && minute <= to;
  const end = roundEndOf(round);
  const breaks = end > FULL_TIME ? [HALF_TIME, FULL_TIME, EXTRA_HALF_TIME] : [HALF_TIME];
  if (from === 0 || breaks.includes(from)) cues.push("kickOff");
  // A VAR check at a break or at the end is decided before the referee blows for it.
  const isWhistleHeld = heldFixtureId !== null;
  if (breaks.some(isNew) && !(isWhistleHeld && breaks.includes(to))) cues.push("halfTime");

  const humanClubIds = humanClubIdsOf(round);
  for (const match of round.matches) {
    const humans = new Set([match.homeId, match.awayId].filter((clubId) => humanClubIds.has(clubId)));
    const until = match.fixtureId === heldFixtureId ? to - 1 : to;
    if (humans.size) cues.push(...humanMatchCues(match, humans, from, until));
    else for (const event of match.events) if (event.type === "goal" && isNew(event.minute) && event.minute <= until) cues.push("otherGoal");
  }

  if (isNew(end) && !(isWhistleHeld && to === end)) cues.push("fullTime");
  return cues;
}

/** How the crowd takes a decision that takes something back: a goal or a penalty off its side, a red card off its player. */
function reactionTo(check: VarCheck, isHuman: boolean): Cue | null {
  if (check.decision === "goalRuledOut" || check.decision === "penaltyCancelled") return isHuman ? "groan" : "relief";
  if (check.decision === "redCardCancelled") return isHuman ? "relief" : "groan";
  return null;
}

/**
 * The sounds of a VAR decision: the referee's whistle, then the goal, penalty or card it let stand, or the
 * crowd taking it in, and the break or final whistle the check held back.
 */
export function varDecisionCues(round: LiveRound, held: { fixtureId: string; check: VarCheck }): Cue[] {
  const match = round.matches.find((m) => m.fixtureId === held.fixtureId);
  const humanClubIds = humanClubIdsOf(round);
  const humans = new Set(match ? [match.homeId, match.awayId].filter((clubId) => humanClubIds.has(clubId)) : []);
  const minute = held.check.minute;
  const reaction = reactionTo(held.check, humans.has(held.check.clubId));
  const end = roundEndOf(round);
  const breaks = end > FULL_TIME ? [HALF_TIME, FULL_TIME, EXTRA_HALF_TIME] : [HALF_TIME];
  const whistle: Cue[] = minute === end ? ["fullTime"] : breaks.includes(minute) ? ["halfTime"] : [];
  return ["varDecision", ...(match ? humanMatchCues(match, humans, minute - 1, minute) : []), ...(reaction ? [reaction] : []), ...whistle];
}

const AWAY: Partial<Record<Cue, Cue>> = { coachGoal: "coachGoalAway", conceded: "concededAway", comeback: "comebackAway" };
const STUNG: ReadonlySet<Cue> = new Set(["coachGoal", "coachGoalAway", "comeback", "comebackAway"]);

/**
 * What the speakers play for a minute's cues, heard from the seated coach's `side` (none when he has no match
 * today): the away end's goals away from home, and the stinger over a human coach's goals.
 */
export function heardCues(cues: readonly Cue[], side: Side | null): Cue[] {
  const heard = cues.map((cue) => (side === "away" ? (AWAY[cue] ?? cue) : cue));
  return heard.some((cue) => STUNG.has(cue)) ? [...heard, "goalStinger"] : heard;
}

const MAX_PER_MINUTE = { 1: 3, 2: 2, 4: 1 } as const;

/** A minute's cues as the clock's speed has room for: each sound once, the most important first. */
export function thinCues(cues: readonly Cue[], speed: keyof typeof MAX_PER_MINUTE): Cue[] {
  return [...new Set(cues)].sort((a, b) => CUES[b].priority - CUES[a].priority).slice(0, MAX_PER_MINUTE[speed]);
}

const SWELL = 1;
const CALM = 0.6;
const TRAILING = 0.4;
const NO_SIDE = 0.5;
/** guess: the sim has no chances, only goals, so "close to scoring" is the two minutes before the coach's side scores. */
const BUILD_UP_MINUTES = 2;
const CHEER_MINUTES = 2;
/** guess: from the 75th minute a match one goal either way gets loud, and stays loud through extra time. */
const TENSION_FROM = 75;
const TENSE = 0.95;

/** How loud the crowd of a match with these `events` is at `minute` for `clubId`'s side, from 0 to 1. */
function crowdFor(events: readonly MatchEvent[], clubId: string, minute: number): number {
  let own = 0;
  let their = 0;
  let isSwelling = false;
  for (const event of events) {
    if (event.type !== "goal") continue;
    const isOwn = event.clubId === clubId;
    if (isOwn && event.minute > minute - CHEER_MINUTES - 1 && event.minute <= minute + BUILD_UP_MINUTES) isSwelling = true;
    if (event.minute > minute) continue;
    if (isOwn) own++;
    else their++;
  }
  if (isSwelling) return SWELL;
  const level = own < their ? TRAILING : CALM;
  if (minute < TENSION_FROM || Math.abs(own - their) > 1) return level;
  const late = Math.min(1, (minute - TENSION_FROM) / (FULL_TIME - TENSION_FROM));
  return Math.max(level, CALM + (TENSE - CALM) * late);
}

/** How loud the crowd under the round is at `minute`, from 0 to 1: the liveliest of the human coaches' matches. */
export function crowdLevel(round: LiveRound, minute: number): number {
  const humanClubIds = humanClubIdsOf(round);
  const levels = round.matches.flatMap((match) => [match.homeId, match.awayId].filter((clubId) => humanClubIds.has(clubId)).map((clubId) => crowdFor(match.events, clubId, minute)));
  return levels.length ? Math.max(...levels) : NO_SIDE;
}
