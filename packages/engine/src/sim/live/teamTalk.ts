import type { DayDecisions } from "../advanceDay.js";
import { waitingCoachesOf } from "../coach/humanCoaches.js";
import type { Fixture, GameState } from "../gameState.js";
import { clubMood } from "../morale/clubMood.js";
import { rivalsOf } from "../morale/rivalsOf.js";
import { isClassico } from "../rivalries/rivalryOf.js";
import type { LiveDay } from "./liveDay.js";

/** The tones of a dressing-room talk: ask for calm, show faith, demand more, praise. */
export const TALK_TONES = ["calm", "faith", "demand", "praise"] as const;
export type TalkTone = (typeof TALK_TONES)[number];

/** Where a side stands when its coach talks: goals ahead (0 before kick-off), squad morale (0 to 100), whether it is a derby. */
export type TalkMoment = { lead: number; morale: number; isDerby: boolean };

/** What a talk does: the shift in the form of the day of the side's players, and the squad morale it leaves after the match. */
export type TalkEffect = { form: number; morale: number };

// guess: no public data measures a team talk. Each tone helps in some moments and backfires in others,
// by at most 0.16 of form, about a third of a normal day's swing (formOfTheDay's FORM_SD 0.45), which is
// a third of a strength point for every player; morale moves by at most 3, less than a win's 5 (reactToDay).
const LOW_MORALE = 40;

/** What talk `tone` does to a side in `moment`. */
export function talkEffect(tone: TalkTone, { lead, morale, isDerby }: TalkMoment): TalkEffect {
  switch (tone) {
    case "calm":
      return { form: lead >= 2 ? 0 : lead === 1 ? 0.08 : lead === 0 ? (isDerby ? 0.12 : 0.06) : lead === -1 ? 0.04 : -0.04, morale: 0 };
    case "faith":
      return { form: lead === -1 ? 0.1 : lead === 0 ? (morale < 50 ? 0.1 : 0.05) : 0.04, morale: 1 };
    case "demand": {
      const isHeard = morale >= LOW_MORALE;
      const form = lead <= -1 ? (isHeard ? 0.16 : -0.06) : lead === 0 ? (isHeard ? 0.06 : -0.04) : -0.08;
      return { form, morale: lead >= 1 ? -3 : isHeard ? -1 : -2 };
    }
    case "praise":
      return { form: lead >= 1 ? 0.12 : lead === 0 ? 0.03 : -0.08, morale: lead >= 1 ? 2 : lead === 0 ? 1 : 0 };
  }
}

/** The tone the assistant takes in `moment`: the one that lifts the side's form most, the calmer one on a tie. */
export function assistantTalk(moment: TalkMoment): TalkTone {
  let best: TalkTone = TALK_TONES[0];
  for (const tone of TALK_TONES) if (talkEffect(tone, moment).form > talkEffect(best, moment).form) best = tone;
  return best;
}

/** Whether the fixture is a clássico for `clubId` (rivalries/rivalryOf.ts). */
export function isDerbyFor(state: Pick<GameState, "clubs">, fixture: Pick<Fixture, "homeId" | "awayId">, clubId: string): boolean {
  const opponent = fixture.homeId === clubId ? fixture.awayId : fixture.homeId;
  return (rivalsOf(state.clubs).get(clubId)?.has(opponent) ?? false) && isClassico(clubId, opponent);
}

/** Where `clubId` stands before kick-off of `fixture`. */
export const kickOffMoment = (state: GameState, fixture: Pick<Fixture, "homeId" | "awayId">, clubId: string): TalkMoment => ({
  lead: 0,
  morale: clubMood(state, clubId).squad,
  isDerby: isDerbyFor(state, fixture, clubId),
});

/** The talk each human coach gives before kick-off today, by his club: the seated coach's and each waiting coach's. */
export function kickOffTalksOf(state: GameState, decisions: DayDecisions): Record<string, TalkTone> {
  const talks: Record<string, TalkTone> = {};
  if (state.coachClubId && decisions.talk) talks[state.coachClubId] = decisions.talk;
  waitingCoachesOf(state).forEach((waiting, index) => {
    const talk = decisions.waiting?.[index]?.talk;
    if (waiting.clubId && talk) talks[waiting.clubId] = talk;
  });
  return talks;
}

/**
 * The game after the final whistle with each human coach's squad morale moved by the talks he gave
 * in his match today: before kick-off (read from the day's kick-off) and at half-time.
 */
export function withTalkMorale(state: GameState, live: LiveDay): GameState {
  const moved = new Map<string, number>();
  const add = (clubId: string, morale: number) => moved.set(clubId, (moved.get(clubId) ?? 0) + morale);
  for (const [clubId, talk] of Object.entries(kickOffTalksOf(live.state, live.decisions))) {
    const match = live.matches.find((m) => m.homeId === clubId || m.awayId === clubId);
    if (match) add(clubId, talkEffect(talk, kickOffMoment(live.state, match, clubId)).morale);
  }
  for (const open of [live.coachMatch, ...(live.waitingMatches ?? [])]) for (const [clubId, talk] of Object.entries(open?.halfTimeTalks ?? {})) add(clubId, talk.morale);
  let next = state;
  for (const [clubId, morale] of moved) {
    if (!morale) continue;
    const mood = clubMood(next, clubId);
    next = { ...next, mood: { ...next.mood, [clubId]: { ...mood, squad: Math.min(100, Math.max(0, mood.squad + morale)) } } };
  }
  return next;
}
