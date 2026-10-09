import { loadTeams } from "../data/players.js";
import { FIRST_CURRENT_SEASON, realDivisionRates, realSerieARates, simulatedSeasonRates, type LeagueRates, type ResultRates } from "./calibration.js";
import { CUP_SEASONS, realCupUpsets, simulatedCupUpsets, type CupUpsetGroup, type DivisionSquads } from "./cupUpsets.js";
import { fitParams } from "./fitParams.js";
import { CALIBRATED, type EngineParams } from "./match.js";
import { CUP_PARAMS, DIVISION_PARAMS } from "./paramsForDivision.js";
import { realTwoLegTies, simulatedTwoLegTies } from "./twoLegTies.js";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const rounded = (params: EngineParams) => JSON.stringify(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Number(v.toFixed(4))])));

function resultError(simulated: ResultRates | LeagueRates, real: ResultRates | LeagueRates): number {
  return (simulated.home - real.home) ** 2 + (simulated.draw - real.draw) ** 2 + (simulated.away - real.away) ** 2 + ((simulated.goalsPerGame - real.goalsPerGame) / 5) ** 2;
}

function marketError(simulated: LeagueRates, real: LeagueRates): number {
  return resultError(simulated, real) + (simulated.homeWinP10 - real.homeWinP10) ** 2 + (simulated.homeWinP90 - real.homeWinP90) ** 2;
}

function cupError(simulated: CupUpsetGroup[], real: CupUpsetGroup[]): number {
  let total = 0;
  let matches = 0;
  simulated.forEach((group, i) => {
    const target = real[i];
    if (!target) return;
    total += target.matches * resultError({ ...group, home: group.win, away: group.loss }, { ...target, home: target.win, away: target.loss });
    matches += target.matches;
  });
  return total / matches;
}

const squads: DivisionSquads = { A: loadTeams("A"), B: loadTeams("B"), C: loadTeams("C"), D: loadTeams("D") };

const realA = realSerieARates();
const fittedA = fitParams(CALIBRATED, ["baseGoals", "homeAdvantage", "strengthImpact", "lowScoreCorrelation"], (p) => marketError(simulatedSeasonRates(squads.A, p), realA));
const simA = simulatedSeasonRates(squads.A, fittedA);
console.log(`\nSérie A ${FIRST_CURRENT_SEASON}+ (real, closing odds)   vs   Boleiro (${squads.A.length} real squads)`);
console.table({
  "home win": [pct(realA.home), pct(simA.home)],
  draw: [pct(realA.draw), pct(simA.draw)],
  "away win": [pct(realA.away), pct(simA.away)],
  "goals per game": [realA.goalsPerGame.toFixed(2), simA.goalsPerGame.toFixed(2)],
  "home win chance p10": [pct(realA.homeWinP10), pct(simA.homeWinP10)],
  "home win chance p90": [pct(realA.homeWinP90), pct(simA.homeWinP90)],
});
console.log("Fitted A:", rounded(fittedA), "\nIn use A:", rounded(DIVISION_PARAMS.A));

for (const division of ["B", "C", "D"] as const) {
  const real = realDivisionRates(division);
  const fitted = fitParams(CALIBRATED, ["baseGoals", "homeAdvantage", "lowScoreCorrelation"], (p) => resultError(simulatedSeasonRates(squads[division], p), real));
  const sim = simulatedSeasonRates(squads[division], DIVISION_PARAMS[division]);
  console.log(`\nSérie ${division} ${division === "D" ? "2024" : `${FIRST_CURRENT_SEASON}+`} (real, ${real.matches} games)   vs   Boleiro (${squads[division].length} real squads, params in use)`);
  console.table({
    "home win": [pct(real.home), pct(sim.home)],
    draw: [pct(real.draw), pct(sim.draw)],
    "away win": [pct(real.away), pct(sim.away)],
    "goals per game": [real.goalsPerGame.toFixed(2), sim.goalsPerGame.toFixed(2)],
  });
  console.log(`Fitted ${division}:`, rounded(fitted), `\nIn use ${division}:`, rounded(DIVISION_PARAMS[division]));
}

const realCup = realCupUpsets();
const fittedCup = fitParams(CALIBRATED, ["baseGoals", "homeAdvantage", "strengthImpact", "gapSaturation"], (p) => cupError(simulatedCupUpsets(squads, p), realCup));
const simCup = simulatedCupUpsets(squads, CUP_PARAMS);
console.log(`\nCopa do Brasil ${CUP_SEASONS.first}–${CUP_SEASONS.last}: higher-division club's win / draw / loss (real vs Boleiro, params in use)`);
console.table(
  Object.fromEntries(
    realCup.map((real, i) => {
      const sim = simCup[i];
      const cell = (r: number, s: number | undefined) => `${pct(r)} / ${pct(s ?? Number.NaN)}`;
      return [
        `${real.gap} fav ${real.venue}`,
        {
          games: real.matches,
          win: cell(real.win, sim?.win),
          draw: cell(real.draw, sim?.draw),
          loss: cell(real.loss, sim?.loss),
          goals: `${real.goalsPerGame.toFixed(2)} / ${sim?.goalsPerGame.toFixed(2)}`,
        },
      ];
    }),
  ),
);
console.log("Fitted cup:", rounded(fittedCup), "\nIn use cup:", rounded(CUP_PARAMS));

const simTies = simulatedTwoLegTies(squads, CUP_PARAMS);
console.log(`\nCopa do Brasil ${CUP_SEASONS.first}–${CUP_SEASONS.last} two-leg ties: higher-division club knocked out (real vs Boleiro, not a fit target)`);
console.table(
  Object.fromEntries(
    realTwoLegTies().map((real, i) => [real.gap, { ties: real.ties, "favourite out": `${pct(real.favouriteOut)} / ${pct(simTies[i]?.favouriteOut ?? Number.NaN)}` }]),
  ),
);
