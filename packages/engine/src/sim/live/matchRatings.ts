import type { SimPlayer } from "../gameState.js";
import { onPitchAt, whoPlayed } from "./aiSubstitutions.js";
import { FULL_TIME, type MatchEvent } from "./matchTimeline.js";

/** A side as rated after the match: who started and who could come on. */
export type RatedSide = { clubId: string; starters: readonly SimPlayer[]; bench: readonly SimPlayer[] };
export type PlayerRating = { playerId: string; rating: number };

// guess: marks in the spirit of the newspapers' 0–10 ratings: a quiet match is a 6, a goal lifts a
// player more than an assist, a red card or an own goal costs most, and a defence answers for the
// goals let in while it was on the pitch.
const BASE = 6;
const RESULT = 0.5;
const GOAL = 1.2;
const PENALTY_GOAL = 0.8;
const ASSIST = 0.7;
const OWN_GOAL = -1;
const YELLOW = -0.3;
const RED = -1.5;
const PENALTY_MISSED = -0.8;
const PENALTY_SAVED = 1;
const CONCEDED = { GK: -0.4, DEF: -0.2, MID: 0, ATT: 0 } as const;
const CLEAN_SHEET = { GK: 0.5, DEF: 0.3, MID: 0, ATT: 0 } as const;
const CLEAN_SHEET_MINUTES = 60;
const LOWEST = 3;
const HIGHEST = 10;

const JUST_BEFORE = 0.5;

/** How long a player was on the pitch: from kick-off or his coming on until he went off, was sent off or got hurt. */
function minutesPlayed(events: readonly MatchEvent[], playerId: string): number {
  const cameOn = events.find((e) => e.type === "substitution" && e.playerId === playerId)?.minute ?? 0;
  const left = events.flatMap((e) => {
    const isOff = e.type === "substitution" && e.offId === playerId;
    const isOut = (e.type === "card" && e.card !== "yellow") || e.type === "injury";
    return isOff || (isOut && e.playerId === playerId) ? [e.minute] : [];
  });
  return Math.min(FULL_TIME, ...left) - cameOn;
}

/** Every player who took part in the match, rated 0 to 10 in tenths from what he did and how his side did. */
export function matchRatings(sides: { home: RatedSide; away: RatedSide }, events: readonly MatchEvent[]): { home: PlayerRating[]; away: PlayerRating[] } {
  const goalsOf = (clubId: string) => events.filter((e) => e.type === "goal" && e.clubId === clubId).length;
  const rate = (own: RatedSide, other: RatedSide): PlayerRating[] => {
    const { players } = whoPlayed(own.starters, own.bench, events, own.clubId);
    const margin = Math.sign(goalsOf(own.clubId) - goalsOf(other.clubId));
    const against = events.filter((e) => e.type === "goal" && e.clubId === other.clubId);
    return players.map((player) => {
      let rating = BASE + RESULT * margin;
      for (const e of events) {
        if (e.type === "goal" && e.playerId === player.id) rating += e.kind === "ownGoal" ? OWN_GOAL : e.kind === "penalty" ? PENALTY_GOAL : GOAL;
        if (e.type === "goal" && e.assistId === player.id) rating += ASSIST;
        if (e.type === "card" && e.playerId === player.id) rating += e.card === "yellow" ? YELLOW : RED;
        if (e.type === "penaltyMiss" && e.playerId === player.id) rating += PENALTY_MISSED;
        if (e.type === "penaltyMiss" && e.keeperId === player.id && e.isSaved) rating += PENALTY_SAVED;
      }
      // A goal comes before the changes made at its minute (inMatchOrder), so it counts against the side just before them.
      const conceded = against.filter((g) => onPitchAt(own.starters, own.bench, events, own.clubId, g.minute - JUST_BEFORE).some((p) => p.id === player.id)).length;
      rating += CONCEDED[player.group] * conceded;
      if (conceded === 0 && !against.length && minutesPlayed(events, player.id) >= CLEAN_SHEET_MINUTES) rating += CLEAN_SHEET[player.group];
      return { playerId: player.id, rating: Math.round(Math.min(HIGHEST, Math.max(LOWEST, rating)) * 10) / 10 };
    });
  };
  return { home: rate(sides.home, sides.away), away: rate(sides.away, sides.home) };
}
