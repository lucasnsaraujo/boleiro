import { inFormation, type Formation } from "@boleiro/engine/engine/formations";
import type { Player, PositionGroup } from "@boleiro/engine/engine/match";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";

/** A shirt's place on the pitch, in percent: `x` from the coach's goal on the left, `y` from the top touchline. */
export type Spot = { x: number; y: number };

// Where each line stands along the pitch, own goal at 0.
const LINE_X: Record<PositionGroup, number> = { GK: 7, DEF: 27, MID: 51, ATT: 75 };

/**
 * Each starter's spot in the formation: the engine's slot for him (inFormation), then his line's
 * players spread evenly across the pitch.
 */
export function pitchSpots(eleven: readonly SquadPlayer[], formation: Formation): Map<string, Spot> {
  const slotted = inFormation<SquadPlayer & Player>(eleven, formation);
  const spots = new Map<string, Spot>();
  for (const group of Object.keys(LINE_X) as PositionGroup[]) {
    const line = slotted.filter((p) => p.slot === group);
    line.forEach((p, i) => spots.set(p.id, { x: LINE_X[group], y: Math.round(((i + 1) / (line.length + 1)) * 1000) / 10 }));
  }
  return spots;
}
