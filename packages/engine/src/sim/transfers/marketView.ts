import { tierOf } from "../finances/tierOf.js";
import type { GameState, SimPlayer, Tier } from "../gameState.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { squadNeeds, type SquadNeeds } from "./squadNeeds.js";
import { splitLoanWages, squadWages } from "./wageBillsOf.js";

/** Lookups the market needs many times a day, built once: squads, tiers, wage bills. */
export type MarketView = {
  squad: (clubId: string) => readonly SimPlayer[];
  tier: (clubId: string) => Tier;
  bill: (clubId: string) => number;
  /** What the club's squad needs (squadNeeds). */
  needs: (clubId: string) => SquadNeeds;
  /** Records a permanent move made after the view was built (not a loan), so it need not be rebuilt. */
  record: (before: SimPlayer | null, after: SimPlayer | null) => void;
};

// A squad is a new array whenever it changes (record, squadsOfGame) and most outlast a market day,
// so each squad's needs are worked out once for its club's tier.
const needsOfSquads = new WeakMap<readonly SimPlayer[], Partial<Record<Tier, SquadNeeds>>>();

export function marketView(state: GameState): MarketView {
  const squads = new Map(squadsOfGame(state));
  const bills = new Map<string, number>();
  for (const [clubId, squad] of squads) bills.set(clubId, squadWages(squad));
  splitLoanWages(state, bills);
  return {
    squad: (clubId) => squads.get(clubId) ?? [],
    tier: (clubId) => tierOf(state.clubs[clubId] ?? { division: null }),
    bill: (clubId) => bills.get(clubId) ?? 0,
    needs: (clubId) => {
      const squad = squads.get(clubId) ?? [];
      const tier = tierOf(state.clubs[clubId] ?? { division: null });
      let known = needsOfSquads.get(squad);
      if (!known) needsOfSquads.set(squad, (known = {}));
      return (known[tier] ??= squadNeeds(squad, tier));
    },
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
