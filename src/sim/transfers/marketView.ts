import { tierOf } from "../finances/tierOf.js";
import type { GameState, SimPlayer, Tier } from "../gameState.js";
import { wageBillsOf } from "./wageBillsOf.js";

/** Lookups the market needs many times a day, built once: squads, tiers, wage bills. */
export type MarketView = {
  squad: (clubId: string) => SimPlayer[];
  tier: (clubId: string) => Tier;
  bill: (clubId: string) => number;
  /** Records a permanent move made after the view was built (not a loan), so it need not be rebuilt. */
  record: (before: SimPlayer | null, after: SimPlayer | null) => void;
};

export function marketView(state: GameState): MarketView {
  const squads = new Map<string, SimPlayer[]>();
  for (const p of Object.values(state.players)) {
    const squad = squads.get(p.clubId);
    if (squad) squad.push(p);
    else squads.set(p.clubId, [p]);
  }
  const bills = wageBillsOf(state);
  return {
    squad: (clubId) => squads.get(clubId) ?? [],
    tier: (clubId) => tierOf(state.clubs[clubId] ?? { division: null }),
    bill: (clubId) => bills.get(clubId) ?? 0,
    record: (before, after) => {
      if (before) {
        squads.set(before.clubId, (squads.get(before.clubId) ?? []).filter((p) => p.id !== before.id));
        bills.set(before.clubId, (bills.get(before.clubId) ?? 0) - before.wage);
      }
      if (after) {
        squads.set(after.clubId, [...(squads.get(after.clubId) ?? []), after]);
        bills.set(after.clubId, (bills.get(after.clubId) ?? 0) + after.wage);
      }
    },
  };
}
