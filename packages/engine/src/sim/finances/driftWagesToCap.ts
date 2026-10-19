import type { ClubFinance, SimPlayer } from "../gameState.js";
import { pow } from "../portableMath.js";

// guess: renewals and squad turnover close half of a gap below the board's cap each season (in log
// terms), at most 50% up. Cuts go straight to the cap, at most halving the bill: lower-division
// contracts are short, often just the state championship. Contracts (src/sim/transfers/) set the
// wage of each move, but the opening wages are spread from each club's published wage bill rather
// than real contracts, so this keeps every bill tied to what its board can pay.
const DRIFT = { riseExponent: 0.5, maxRise: 1.5, maxCut: 0.5 };

/** Moves every club's wages toward its board's wage cap. */
export function driftWagesToCap(players: Record<string, SimPlayer>, finances: Record<string, ClubFinance>): Record<string, SimPlayer> {
  const bills = new Map<string, number>();
  for (const p of Object.values(players)) bills.set(p.clubId, (bills.get(p.clubId) ?? 0) + p.wage);
  const factors = new Map([...bills].map(([clubId, bill]) => {
    const cap = finances[clubId]?.wageCap ?? bill;
    const factor = bill <= 0 ? 1 : cap > bill ? pow(cap / bill, DRIFT.riseExponent) : cap / bill;
    return [clubId, Math.min(DRIFT.maxRise, Math.max(DRIFT.maxCut, factor))];
  }));
  return Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { ...p, wage: Math.max(1, Math.round(p.wage * (factors.get(p.clubId) ?? 1))) }]));
}
