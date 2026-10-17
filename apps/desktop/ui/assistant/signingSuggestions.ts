import { GROUP_OF_ROLE } from "@boleiro/data/players";
import { positionFit, SECONDARY_POSITION } from "@boleiro/engine/engine/formations";
import { assistantReadOf, type Assistant } from "@boleiro/engine/sim/coach/assistant";
import type { WeakSpot } from "@boleiro/engine/sim/coach/assistantTips";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { NO_FILTERS } from "@boleiro/game-client/market/marketFilters";
import { searchMarket, type MarketRow, type MarketState } from "../market/marketSearch.js";

/** A player the assistant suggests, with the strength he reads in him. */
export type Suggestion = MarketRow & { read: number };

// guess: the assistant looks over the 60 strongest of the position who might join, and names the four he rates best.
const LOOKED_AT = 60;
const SHOWN = 4;
// guess: a signing is worth suggesting when he reads him at least two points above the starter he would replace.
const BETTER_BY = 2;

/**
 * The signings the assistant suggests for the weak spot of his tip: players of other clubs and free
 * agents who play its position, would join (the market's yes or maybe), and whose club asks no more
 * than the board's transfer budget; those he reads two points above the starter or more, best first as
 * he reads them. A worse assistant reads them further off, so he may suggest a player no better.
 */
export function signingSuggestions(
  state: MarketState & Pick<GameState, "seed" | "season" | "finances">,
  assistant: Pick<Assistant, "id" | "level">,
  tip: WeakSpot,
  watched: ReadonlySet<string>,
): { budget: number; rows: Suggestion[] } {
  const budget = state.coachClubId ? (state.finances[state.coachClubId]?.transferBudget ?? 0) : 0;
  const read = assistantReadOf(state, assistant);
  const playsRole = (row: MarketRow) => {
    const player = state.players[row.id] ?? state.market.freeAgents[row.id];
    return !!player && positionFit(player, tip.role) >= SECONDARY_POSITION;
  };
  const rows = searchMarket(state, { ...NO_FILTERS, group: GROUP_OF_ROLE[tip.role], isWillingOnly: true }, LOOKED_AT, watched)
    .rows.filter((row) => row.price !== null && row.price <= budget && playsRole(row))
    .map((row) => ({ ...row, read: read(row.id, row.strength) }))
    .filter((row) => row.read >= tip.read + BETTER_BY)
    .sort((a, b) => b.read - a.read || a.id.localeCompare(b.id))
    .slice(0, SHOWN);
  return { budget, rows };
}
