import type { Formation } from "../../engine/formations.js";
import type { Posture } from "../../engine/match.js";

/**
 * How the coach sets his side up. With no penalty taker, or one not on the pitch, the best forward
 * takes them. `kickerOrder` is who kicks first in a shootout; anyone left out, or every kicker when
 * the order is missing, lines up strongest first.
 */
export type Tactics = { formation: Formation; posture: Posture; penaltyTakerId: string | null; kickerOrder?: readonly string[] };

export const DEFAULT_TACTICS: Tactics = { formation: "4-4-2", posture: "balanced", penaltyTakerId: null };

// guess: an AI coach plays balanced until the last half hour, then chases a game it is losing and
// sits on a lead in the last quarter of an hour.
const CHASE_FROM_MINUTE = 60;
const PROTECT_FROM_MINUTE = 75;

/** The AI coach's posture at this minute, given his side's goal difference. */
export function aiPosture(goalDifference: number, minute: number): Posture {
  if (goalDifference < 0 && minute >= CHASE_FROM_MINUTE) return "attacking";
  if (goalDifference > 0 && minute >= PROTECT_FROM_MINUTE) return "defensive";
  return "balanced";
}
