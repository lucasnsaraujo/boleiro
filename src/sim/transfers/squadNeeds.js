import { pickLineup } from "../../engine/match.js";
// Average 2026 squad per club by tier in data/players.csv: Série A 672 players / 20 clubs, B 651 / 20,
// C 638 / 20, D 2,279 / 96, state-only 2,524 / 125. AI clubs renew and sign to keep this size.
export const SQUAD_TARGET = { A: 33, B: 32, C: 31, D: 23, state: 20 };
// guess: a replacement is near the club's level: from 4 below to 2 above the average of its best eleven.
export const REPLACEMENT_BAND = { below: 4, above: 2 };
// guess: share of each position group in a squad (3 keepers in 24), as developPlayers tops squads up.
const SHAPE = { GK: 3, DEF: 8, MID: 8, ATT: 5 };
const GROUPS = ["GK", "DEF", "MID", "ATT"];
export function squadNeeds(squad, tier) {
    const lineup = pickLineup([...squad]);
    const level = lineup.reduce((sum, p) => sum + p.strength, 0) / Math.max(1, lineup.length);
    const weakest = lineup.reduce((a, b) => (a === null || b.strength < a.strength ? b : a), null);
    const count = (g) => squad.filter((p) => p.group === g).length / SHAPE[g];
    const thinnest = GROUPS.reduce((a, b) => (count(b) < count(a) ? b : a));
    return { level, weakest, thinnest, short: Math.max(0, SQUAD_TARGET[tier] - squad.length) };
}
