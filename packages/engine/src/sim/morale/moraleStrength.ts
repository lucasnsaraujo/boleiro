import { daysBetween } from "../dates.js";
import type { IsoDate, SimPlayer } from "../gameState.js";
import { ADAPTATION_DAYS } from "../players/effectiveStrength.js";

// guess: strength points a player gains at full morale (100) and loses at none (0). Kept to about
// a quarter of home advantage (0.36 log-goals at 0.084 per point, in CALIBRATED): no study we
// found measures how much team morale moves results.
const MORALE_STRENGTH = 1;
// guess: a player who got under a quarter of the minutes of the squad's most-used player, once that
// player has ten full games, is this many morale points below his squad.
const LEFT_OUT_MORALE = 15;
const LEFT_OUT_SHARE = 0.25;
const LEFT_OUT_AFTER_MINUTES = 900;
// guess: a foreigner in his first half-season at the club is this many morale points below his squad.
const ADAPTING_MORALE = 10;

/**
 * Strength points a player gains or loses today from his squad's morale, his playing time
 * against `mostMinutes` (the squad's most-used player) and, for a foreigner, settling in.
 */
export function moraleStrength(player: SimPlayer, squadMorale: number, mostMinutes: number, date: IsoDate): number {
  const { seasonMinutes, arrivedOn } = player.condition;
  const leftOut = mostMinutes >= LEFT_OUT_AFTER_MINUTES && seasonMinutes < LEFT_OUT_SHARE * mostMinutes ? LEFT_OUT_MORALE : 0;
  const adapting = arrivedOn !== null && daysBetween(arrivedOn, date) < ADAPTATION_DAYS ? ADAPTING_MORALE : 0;
  const morale = Math.min(100, Math.max(0, squadMorale - leftOut - adapting));
  return (MORALE_STRENGTH * (morale - 50)) / 50;
}
