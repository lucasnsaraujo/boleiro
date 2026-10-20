import { daysBetween } from "../dates.js";
import { fatigueOn } from "./fatigueOn.js";
// guess: strength points lost by a player carrying one full match of fatigue (played the day
// before). Kept small: fixture congestion barely changes team results (Bengtsson, Ekstrand &
// Hägglund 2013, BJSM 47(12):743–747; Dupont et al. 2010, Am J Sports Med 38(9):1752–1758).
const FATIGUE_COST = 4;
// guess: strength points a player with the poorOnArtificialTurf trait loses on a synthetic pitch.
const ARTIFICIAL_TURF_COST = 3;
// guess: a foreign player starts this many points below his strength and closes the gap in a
// straight line over his first half-season at the club.
const ADAPTATION_COST = 5;
export const ADAPTATION_DAYS = 180;
function isForeign(player) {
    return player.nationalities.length > 0 && !player.nationalities.includes("Brazil");
}
function adaptationCost(player, date) {
    if (!isForeign(player) || player.condition.arrivedOn === null)
        return 0;
    const settled = daysBetween(player.condition.arrivedOn, date) / ADAPTATION_DAYS;
    return ADAPTATION_COST * Math.max(0, 1 - settled);
}
/** The strength a player plays at in this match: his strength less fatigue, pitch and adaptation. */
export function effectiveStrength(player, { date, pitch }) {
    const turf = pitch === "artificial" && player.trait === "poorOnArtificialTurf" ? ARTIFICIAL_TURF_COST : 0;
    const tired = (FATIGUE_COST * fatigueOn(player, date)) / 100;
    return Math.max(1, player.strength - tired - turf - adaptationCost(player, date));
}
