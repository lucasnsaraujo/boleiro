import { NO_RECORDS } from "./history.js";
const margin = (mark) => Math.abs(mark.goalsFor - mark.goalsAgainst);
/** A club's records after one match: each one changes only when the match beats it outright. */
export function updateClubRecords(records, match, crowd) {
    const current = records ?? NO_RECORDS;
    const won = match.goalsFor > match.goalsAgainst;
    const lost = match.goalsFor < match.goalsAgainst;
    return {
        ...current,
        biggestWin: won && (!current.biggestWin || margin(match) > margin(current.biggestWin)) ? match : current.biggestWin,
        biggestLoss: lost && (!current.biggestLoss || margin(match) > margin(current.biggestLoss)) ? match : current.biggestLoss,
        biggestCrowd: crowd && crowd.crowd > (current.biggestCrowd?.crowd ?? 0) ? crowd : current.biggestCrowd,
    };
}
