import { loadTeams } from "../data/players.js";
import { FIRST_CURRENT_SEASON, realSerieARates, simulatedSeasonRates, type LeagueRates } from "./calibration.js";
import { CALIBRATED, type EngineParams } from "./match.js";

const TUNED = ["baseGoals", "homeAdvantage", "strengthImpact", "lowScoreCorrelation"] as const;

function error(simulated: LeagueRates, real: LeagueRates): number {
  return (
    (simulated.home - real.home) ** 2 +
    (simulated.draw - real.draw) ** 2 +
    (simulated.away - real.away) ** 2 +
    ((simulated.goalsPerGame - real.goalsPerGame) / 5) ** 2 +
    (simulated.homeWinP10 - real.homeWinP10) ** 2 +
    (simulated.homeWinP90 - real.homeWinP90) ** 2
  );
}

const teams = loadTeams("A");
const real = realSerieARates();
let best: EngineParams = { ...CALIBRATED };
let bestError = error(simulatedSeasonRates(teams, best), real);
let step = 0.1;
while (step > 0.0005) {
  let improved = false;
  for (const key of TUNED) {
    for (const direction of [1, -1]) {
      const candidate = { ...best, [key]: best[key] + direction * step * Math.max(Math.abs(best[key]), 0.05) };
      const candidateError = error(simulatedSeasonRates(teams, candidate), real);
      if (candidateError < bestError) {
        best = candidate;
        bestError = candidateError;
        improved = true;
      }
    }
  }
  if (!improved) step /= 2;
}

const fitted = simulatedSeasonRates(teams, best);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
console.log(`Série A ${FIRST_CURRENT_SEASON}+ (real)   vs   Boleiro (${teams.length} real squads)`);
console.table({
  "home win": [pct(real.home), pct(fitted.home)],
  draw: [pct(real.draw), pct(fitted.draw)],
  "away win": [pct(real.away), pct(fitted.away)],
  "goals per game": [real.goalsPerGame.toFixed(2), fitted.goalsPerGame.toFixed(2)],
  "home win chance p10": [pct(real.homeWinP10), pct(fitted.homeWinP10)],
  "home win chance p90": [pct(real.homeWinP90), pct(fitted.homeWinP90)],
});
console.log("Fitted params:", JSON.stringify(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, Number(v.toFixed(4))]))));
