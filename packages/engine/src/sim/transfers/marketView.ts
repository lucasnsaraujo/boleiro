import { tierOf } from "../finances/tierOf.js";
import type { GameState, SimPlayer, Tier } from "../gameState.js";
import { squadsOfGame } from "../players/squadsByClub.js";
import { squadNeeds, type SquadNeeds } from "./squadNeeds.js";
import { splitLoanWages, squadWages } from "./wageBillsOf.js";
import { wageDemand } from "./wageDemand.js";

/** Lookups the market needs many times a day, built once: squads, tiers, wage bills. */
export type MarketView = {
  squad: (clubId: string) => readonly SimPlayer[];
  tier: (clubId: string) => Tier;
  bill: (clubId: string) => number;
  /** What the club's squad needs (squadNeeds). */
  needs: (clubId: string) => SquadNeeds;
  /** What the club's squad will need once its pre-contracts take effect: with the players joining it, without those leaving. */
  plannedNeeds: (clubId: string) => SquadNeeds;
  /** The wage bill once its pre-contracts take effect: with the wages promised to the players joining, without those leaving. */
  plannedBill: (clubId: string) => number;
  /** Records a permanent move made after the view was built (not a loan), so it need not be rebuilt. */
  record: (before: SimPlayer | null, after: SimPlayer | null) => void;
  /** Records a pre-contract signed after the view was built: the player joins `clubId` at `wage` when his contract ends. */
  recordPreContract: (player: SimPlayer, clubId: string, wage: number) => void;
};

type Plan = { joining: SimPlayer[]; leaving: Set<string>; wageChange: number };

// A squad is a new array whenever it changes (record, squadsOfGame) and most outlast a market day,
// so each squad's needs are worked out once for its club's tier.
const needsOfSquads = new WeakMap<readonly SimPlayer[], Partial<Record<Tier, SquadNeeds>>>();

export function marketView(state: GameState): MarketView {
  const squads = new Map(squadsOfGame(state));
  const bills = new Map<string, number>();
  for (const [clubId, squad] of squads) bills.set(clubId, squadWages(squad));
  splitLoanWages(state, bills);
  const needsOf = (clubId: string, squad: readonly SimPlayer[]) => {
    const tier = tierOf(state.clubs[clubId] ?? { division: null });
    let known = needsOfSquads.get(squad);
    if (!known) needsOfSquads.set(squad, (known = {}));
    return (known[tier] ??= squadNeeds(squad, tier));
  };
  // Only the AI clubs' trading reads the pre-contracts, so they are worked out the first time it asks.
  let plans: Map<string, Plan> | null = null;
  const plannedSquads = new Map<string, readonly SimPlayer[]>();
  const planOf = (clubId: string): Plan => {
    const all = plansOf();
    let plan = all.get(clubId);
    if (!plan) all.set(clubId, (plan = { joining: [], leaving: new Set(), wageChange: 0 }));
    return plan;
  };
  const sign = (player: SimPlayer, clubId: string, wage: number) => {
    const to = planOf(clubId);
    to.joining.push(player);
    to.wageChange += wage;
    const from = planOf(player.clubId);
    from.leaving.add(player.id);
    from.wageChange -= player.wage;
    plannedSquads.delete(clubId);
    plannedSquads.delete(player.clubId);
  };
  const plansOf = (): Map<string, Plan> => {
    if (plans) return plans;
    plans = new Map();
    for (const [playerId, clubId] of Object.entries(state.market.preContracts)) {
      const player = state.players[playerId];
      if (player) sign(player, clubId, wageDemand(player, squads.get(clubId) ?? []));
    }
    return plans;
  };
  const plannedSquad = (clubId: string): readonly SimPlayer[] => {
    const squad = squads.get(clubId) ?? [];
    const plan = plansOf().get(clubId);
    if (!plan) return squad;
    let known = plannedSquads.get(clubId);
    if (!known) plannedSquads.set(clubId, (known = [...squad.filter((p) => !plan.leaving.has(p.id)), ...plan.joining]));
    return known;
  };
  const bill = (clubId: string) => bills.get(clubId) ?? 0;
  return {
    squad: (clubId) => squads.get(clubId) ?? [],
    tier: (clubId) => tierOf(state.clubs[clubId] ?? { division: null }),
    bill,
    needs: (clubId) => needsOf(clubId, squads.get(clubId) ?? []),
    plannedNeeds: (clubId) => needsOf(clubId, plannedSquad(clubId)),
    plannedBill: (clubId) => bill(clubId) + (plansOf().get(clubId)?.wageChange ?? 0),
    record: (before, after) => {
      if (before) {
        squads.set(before.clubId, (squads.get(before.clubId) ?? []).filter((p) => p.id !== before.id));
        bills.set(before.clubId, (bills.get(before.clubId) ?? 0) - before.wage);
        plannedSquads.delete(before.clubId);
      }
      if (after) {
        squads.set(after.clubId, [...(squads.get(after.clubId) ?? []), after]);
        bills.set(after.clubId, (bills.get(after.clubId) ?? 0) + after.wage);
        plannedSquads.delete(after.clubId);
      }
    },
    // The game may already hold the pre-contract when the plans are first read.
    recordPreContract: (player, clubId, wage) => {
      if (!planOf(clubId).joining.some((p) => p.id === player.id)) sign(player, clubId, wage);
    },
  };
}
