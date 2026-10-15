import { useEffect, useState } from "react";

/** How long the score stickers stay down after a goal before they lift again. */
export const STICKERS_DOWN_AFTER_GOAL_MS = 2600;

/**
 * Whether the band's score stickers give way to the slim scoreboard: only while the ball is in play, and not
 * for a moment after each goal, when they drop back full size. `isGoalHeld` is that moment.
 */
export function useStickerLift(goals: number, isInPlay: boolean): { isLifted: boolean; isGoalHeld: boolean } {
  const [heldGoals, setHeldGoals] = useState(goals);
  const isGoalHeld = goals !== heldGoals;
  useEffect(() => {
    if (!isGoalHeld) return;
    const release = setTimeout(() => setHeldGoals(goals), STICKERS_DOWN_AFTER_GOAL_MS);
    return () => clearTimeout(release);
  }, [goals, isGoalHeld]);
  return { isLifted: isInPlay && !isGoalHeld, isGoalHeld };
}
