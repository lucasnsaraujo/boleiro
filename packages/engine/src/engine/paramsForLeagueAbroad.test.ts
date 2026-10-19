import { describe, expect, it } from "vitest";
import { realAbroadRates } from "../cli/realAbroadRates.js";
import { loadEurope } from "../sim/world/loadEurope.js";
import { loadMarketLeagues } from "../sim/world/loadMarketLeagues.js";
import { loadSouthAmerica } from "../sim/world/loadSouthAmerica.js";
import { resultOnlyTeam } from "../sim/world/resultOnlyLeague.js";
import { simulatedSeasonRates } from "./calibration.js";
import { leagueAbroadKey, paramsForLeagueAbroad } from "./paramsForLeagueAbroad.js";

const countries = [...loadSouthAmerica(2026), ...loadEurope(2026), ...loadMarketLeagues(2026)];
const leagues = countries.flatMap(({ structure, levels }) => levels.map((clubs, level) => ({ country: structure.id, level, clubs })));

// The Série B tolerance of calibration.test.ts: every league here has 720 to 2,254 real games.
describe.each([...realAbroadRates()])("calibration against the real %s", (key, real) => {
  const league = leagues.find(({ country, level }) => leagueAbroadKey(country, level) === key);
  if (!league) throw new Error(`no league ${key} in the world`);
  const simulated = simulatedSeasonRates(league.clubs.map(resultOnlyTeam), paramsForLeagueAbroad(league.country, league.level));

  it("matches the real home, draw and away rates within two points", () => {
    expect(Math.abs(simulated.home - real.home / real.matches)).toBeLessThan(0.02);
    expect(Math.abs(simulated.draw - real.draw / real.matches)).toBeLessThan(0.02);
    expect(Math.abs(simulated.away - real.away / real.matches)).toBeLessThan(0.02);
  });

  it("scores as many goals per game as the real league", () => {
    expect(Math.abs(simulated.goalsPerGame - real.goals / real.matches)).toBeLessThan(0.1);
  });
});
