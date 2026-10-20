import { advanceDay } from "../sim/advanceDay.js";
import { tierOf } from "../sim/finances/tierOf.js";
import { loadNewGame } from "../sim/loadNewGame.js";
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
/** Each tier's strength and age band in a state. */
export function strengthBands(state) {
    const byTier = new Map();
    for (const p of Object.values(state.players)) {
        const club = state.clubs[p.clubId];
        if (!club)
            continue;
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
export function strengthBySeason(seed, seasons) {
    let state = loadNewGame(seed, { coachClubId: null });
    const result = { bands: strengthBands(state), retired: 0, youth: 0, injuries: 0 };
    const lastSeason = state.season + seasons - 1;
    while (state.season <= lastSeason) {
        const day = advanceDay(state, {});
        state = day.state;
        for (const event of day.events) {
            if (event.type === "playerRetired")
                result.retired++;
            if (event.type === "youthPromoted")
                result.youth++;
            if (event.type === "playerInjured")
                result.injuries++;
        }
        if (day.events.some((e) => e.type === "seasonEnded"))
            result.bands.push(...strengthBands(state));
    }
    return result;
}
