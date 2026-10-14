import { tierOf } from "../sim/finances/tierOf.js";
import type { GameState, Tier } from "../sim/gameState.js";
import { isBrazilian } from "../sim/transfers/willingToJoin.js";

/** Share of each tier's players who are not Brazilian. */
export function foreignShare(state: GameState): Record<Tier, number> {
  const counts: Record<Tier, [foreign: number, all: number]> = { A: [0, 0], B: [0, 0], C: [0, 0], D: [0, 0], state: [0, 0] };
  for (const p of Object.values(state.players)) {
    const club = state.clubs[p.clubId];
    if (!club) continue;
    const count = counts[tierOf(club)];
    count[1]++;
    if (!isBrazilian(p.nationalities)) count[0]++;
  }
  const share = ([foreign, all]: [number, number]) => (all ? foreign / all : 0);
  return { A: share(counts.A), B: share(counts.B), C: share(counts.C), D: share(counts.D), state: share(counts.state) };
}
