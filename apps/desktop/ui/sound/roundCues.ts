import { FULL_TIME, HALF_TIME } from "@boleiro/engine/sim/live/matchTimeline";
import type { LiveRound } from "@boleiro/game-client/round/liveRoundOf";
import { CUES, type Cue } from "./soundCatalog.js";

/** The sounds of the minutes after `from` up to `to`: whistles, every goal of the round, and the cards and injuries of the coach's match. */
export function roundCues(round: LiveRound, from: number, to: number): Cue[] {
  const cues: Cue[] = [];
  const isNew = (minute: number) => minute > from && minute <= to;
  if (from === 0 || from === HALF_TIME) cues.push("kickOff");
  if (isNew(HALF_TIME)) cues.push("halfTime");

  const coachClubId = round.coachClubId;
  for (const match of round.matches) {
    const isCoach = coachClubId !== null && match.fixtureId === round.coach?.fixtureId;
    let own = 0;
    let their = 0;
    let hasTrailed = false;
    let hasComeBack = false;
    for (const event of match.events) {
      if (event.minute > to) break;
      if (!isCoach) {
        if (event.type === "goal" && isNew(event.minute)) cues.push("otherGoal");
        continue;
      }
      if (event.type === "goal") {
        const isOwn = event.clubId === coachClubId;
        if (isOwn) own++;
        else their++;
        const isComeback: boolean = isOwn && hasTrailed && !hasComeBack && own === their + 1;
        hasTrailed ||= own < their;
        hasComeBack ||= isComeback;
        if (isNew(event.minute)) cues.push(!isOwn ? "conceded" : isComeback ? "comeback" : "coachGoal");
      }
      if (!isNew(event.minute)) continue;
      if (event.type === "card") cues.push(event.card === "yellow" ? "card" : "redCard");
      if (event.type === "injury") cues.push("injury");
    }
  }

  if (isNew(FULL_TIME)) cues.push("fullTime");
  return cues;
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

/** How loud the crowd under the round is at `minute`, from 0 to 1, as the coach's match goes. */
export function crowdLevel(round: LiveRound, minute: number): number {
  const match = round.matches.find((m) => m.fixtureId === round.coach?.fixtureId);
  const coachClubId = round.coachClubId;
  if (!match || !coachClubId) return NO_SIDE;
  let own = 0;
  let their = 0;
  let isSwelling = false;
  for (const event of match.events) {
    if (event.type !== "goal") continue;
    const isOwn = event.clubId === coachClubId;
    if (isOwn && event.minute > minute - CHEER_MINUTES - 1 && event.minute <= minute + BUILD_UP_MINUTES) isSwelling = true;
    if (event.minute > minute) continue;
    if (isOwn) own++;
    else their++;
  }
  if (isSwelling) return SWELL;
  return own < their ? TRAILING : CALM;
}
