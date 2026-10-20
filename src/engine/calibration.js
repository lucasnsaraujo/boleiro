import { readFileSync } from "node:fs";
import { parseCsv } from "../data/csv.js";
import { loadResults } from "../data/history.js";
import { CALIBRATED, matchOdds } from "./match.js";
const HISTORY_CSV = new URL("../../data/history/brasileirao-serie-a-odds.csv", import.meta.url);
export const FIRST_CURRENT_SEASON = 2022;
function quantile(sorted, q) {
    return sorted[Math.round(q * (sorted.length - 1))] ?? Number.NaN;
}
export function realSerieARates() {
    const games = parseCsv(readFileSync(HISTORY_CSV, "utf8")).filter((g) => Number(g.Season) >= FIRST_CURRENT_SEASON && g.HG !== "" && Number(g.AvgCH) > 0);
    const share = (result) => games.filter((g) => g.Res === result).length / games.length;
    const homeWinChances = games
        .map((g) => {
        const [h, d, a] = [g.AvgCH, g.AvgCD, g.AvgCA].map((odd) => 1 / Number(odd));
        return h / (h + d + a);
    })
        .sort((x, y) => x - y);
    return {
        home: share("H"),
        draw: share("D"),
        away: share("A"),
        goalsPerGame: games.reduce((sum, g) => sum + Number(g.HG) + Number(g.AG), 0) / games.length,
        homeWinP10: quantile(homeWinChances, 0.1),
        homeWinP90: quantile(homeWinChances, 0.9),
    };
}
const DIVISION_COMPETITION = { B: "serie-b", C: "serie-c", D: "serie-d" };
/** Every finished game from FIRST_CURRENT_SEASON on (Série D has only 2024); no odds exist for B–D. */
export function realDivisionRates(division) {
    const games = loadResults(DIVISION_COMPETITION[division]).filter((g) => g.season >= FIRST_CURRENT_SEASON);
    const share = (won) => games.filter(won).length / games.length;
    return {
        matches: games.length,
        home: share((g) => g.homeGoals > g.awayGoals),
        draw: share((g) => g.homeGoals === g.awayGoals),
        away: share((g) => g.homeGoals < g.awayGoals),
        goalsPerGame: games.reduce((sum, g) => sum + g.homeGoals + g.awayGoals, 0) / games.length,
    };
}
export function simulatedSeasonRates(teams, params = CALIBRATED) {
    const fixtures = teams.flatMap((home) => teams.filter((away) => away !== home).map((away) => matchOdds(home, away, params)));
    const mean = (pick) => fixtures.reduce((sum, o) => sum + pick(o), 0) / fixtures.length;
    const homeWinChances = fixtures.map((o) => o.home).sort((x, y) => x - y);
    return {
        home: mean((o) => o.home),
        draw: mean((o) => o.draw),
        away: mean((o) => o.away),
        goalsPerGame: mean((o) => o.expectedHomeGoals + o.expectedAwayGoals),
        homeWinP10: quantile(homeWinChances, 0.1),
        homeWinP90: quantile(homeWinChances, 0.9),
    };
}
