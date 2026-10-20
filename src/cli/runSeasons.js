import { loadNewGame } from "../sim/loadNewGame.js";
import { playSeason } from "./playSeason.js";
import { strengthBands } from "./strengthBySeason.js";
import { seasonStats } from "./seasonStats.js";
import { summarizeSeason } from "./summarizeSeason.js";
/**
 * Plays `seasons` whole seasons with no coach. `betweenSeasons` gets the state at each new season's
 * start and returns the state to play on with, so a test can save and load it there.
 */
export function runSeasons(seed, seasons, betweenSeasons = (state) => state) {
    let state = loadNewGame(seed, { coachClubId: null });
    const played = [];
    const strength = strengthBands(state);
    for (let i = 0; i < seasons; i++) {
        const season = playSeason(state);
        played.push({ summary: summarizeSeason(season), stats: seasonStats(season) });
        strength.push(...strengthBands(season.after));
        state = betweenSeasons(season.after);
    }
    return { seasons: played, strength, final: state };
}
