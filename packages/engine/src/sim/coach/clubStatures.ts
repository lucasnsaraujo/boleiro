import { projectedRevenue } from "../finances/setBoardBudget.js";
import type { GameState } from "../gameState.js";

/** Each national club's percentile (0 smallest, 100 biggest) by `values`. */
function percentiles(ids: readonly string[], values: (id: string) => number): Map<string, number> {
  const sorted = [...ids].sort((a, b) => values(a) - values(b) || a.localeCompare(b));
  const last = Math.max(1, sorted.length - 1);
  return new Map(sorted.map((id, index) => [id, (100 * index) / last]));
}

/**
 * How big each club in a national league is, from 0 to 100: the mean of its percentiles by
 * fanbase and by the revenue the board expects, among Brazil's or among its country's abroad.
 * State-only clubs have no stature.
 */
export function clubStatures(state: Pick<GameState, "clubs" | "finances">): Map<string, number> {
  const brazil = Object.values(state.clubs).filter((club) => club.division !== null).map((club) => club.id);
  const abroad = new Map<string, string[]>();
  for (const club of Object.values(state.clubs)) if (club.abroad) abroad.set(club.abroad.country, [...(abroad.get(club.abroad.country) ?? []), club.id]);
  // Each country abroad ranks its clubs among themselves, so they don't move Brazil's.
  return new Map([brazil, ...abroad.values()].flatMap((ids) => [...staturesAmong(state, ids)]));
}

function staturesAmong(state: Pick<GameState, "clubs" | "finances">, ids: readonly string[]): Map<string, number> {
  const byFans = percentiles(ids, (id) => state.clubs[id]?.fanbase ?? 0);
  const finance = (id: string) => state.finances[id];
  const byRevenue = percentiles(ids, (id) => {
    const f = finance(id);
    return f ? projectedRevenue(f) : 0;
  });
  return new Map(ids.map((id) => [id, Math.round(((byFans.get(id) ?? 0) + (byRevenue.get(id) ?? 0)) / 2)]));
}
