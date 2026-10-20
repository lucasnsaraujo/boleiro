import { pickLineup } from "../../engine/match.js";
/** Average strength of the automatic best eleven. */
export function squadStrength(squad) {
    const lineup = pickLineup([...squad]);
    return lineup.reduce((sum, p) => sum + p.strength, 0) / Math.max(lineup.length, 1);
}
