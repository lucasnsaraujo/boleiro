import type { DayEvent } from "./inboxLines.js";
import type { CoachFired } from "../../src/sim/coach/judgeCoaches.js";
import type { GameState } from "../../src/sim/gameState.js";
import { seasonReview, type SeasonReview } from "../seasonEnd/seasonReview.js";

/** Something a day brought that gets a screen of its own before the coach goes on. */
export type TurningPoint = { kind: "fired"; firing: CoachFired } | { kind: "seasonEnd"; review: SeasonReview };

/** The turning points of the day played from `before` to `after`, in the order they happened. */
export function turningPointsOf(before: GameState, after: GameState, events: readonly DayEvent[]): TurningPoint[] {
  const points: TurningPoint[] = [];
  for (const event of events) {
    if (event.type === "coachFired" && event.isYou) points.push({ kind: "fired", firing: event });
    if (event.type === "seasonEnded") points.push({ kind: "seasonEnd", review: seasonReview(before, after, events) });
  }
  return points;
}
