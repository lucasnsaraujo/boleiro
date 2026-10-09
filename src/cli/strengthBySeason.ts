import { advanceDay } from "../sim/advanceDay.js";
import { tierOf } from "../sim/finances/tierOf.js";
import type { GameState, Tier } from "../sim/gameState.js";
import { loadNewGame } from "../sim/loadNewGame.js";

export type StrengthBand = { season: number; tier: Tier; players: number; mean: number; p10: number; p90: number; meanAge: number };

const quantile = (sorted: readonly number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);

function bands(state: GameState): StrengthBand[] {
  const byTier = new Map<Tier, { strength: number[]; age: number[] }>();
  for (const p of Object.values(state.players)) {
    const club = state.clubs[p.clubId];
    if (!club) continue;
    const tier = byTier.get(tierOf(club)) ?? { strength: [], age: [] };
    tier.strength.push(p.strength);
    tier.age.push(p.age);
    byTier.set(tierOf(club), tier);
  }
  return [...byTier].map(([tier, { strength, age }]) => {
    const sorted = [...strength].sort((a, b) => a - b);
    return { season: state.season, tier, players: sorted.length, mean: mean(sorted), p10: quantile(sorted, 0.1), p90: quantile(sorted, 0.9), meanAge: mean(age) };
  });
}

/** Plays `seasons` whole seasons with no coach and returns each division's strength band at the start of every season, plus the one after. */
export function strengthBySeason(seed: number, seasons: number): { bands: StrengthBand[]; retired: number; youth: number; injuries: number } {
  let state = loadNewGame(seed, { coachClubId: null });
  const result = { bands: bands(state), retired: 0, youth: 0, injuries: 0 };
  const lastSeason = state.season + seasons - 1;
  while (state.season <= lastSeason) {
    const day = advanceDay(state, {});
    state = day.state;
    for (const event of day.events) {
      if (event.type === "playerRetired") result.retired++;
      if (event.type === "youthPromoted") result.youth++;
      if (event.type === "playerInjured") result.injuries++;
    }
    if (day.events.some((e) => e.type === "seasonEnded")) result.bands.push(...bands(state));
  }
  return result;
}
