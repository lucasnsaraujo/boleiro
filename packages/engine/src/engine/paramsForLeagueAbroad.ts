import { CALIBRATED, type EngineParams } from "./match.js";
import { DIVISION_PARAMS } from "./paramsForDivision.js";

/** A league abroad by its country id and level, top first from 1: `gb-eng-1` for the Premier League. */
export const leagueAbroadKey = (country: string, level: number): string => `${country}-${level + 1}`;

const fitted = (baseGoals: number, homeAdvantage: number, lowScoreCorrelation: number): EngineParams => ({ ...CALIBRATED, baseGoals, homeAdvantage, lowScoreCorrelation });

/**
 * Fitted by `pnpm calibrate` to each league's real results in data/history/football-data/league-rates.csv
 * (football-data.co.uk, 2022/23 to 2025/26 or the calendar years 2022–2025): baseGoals, homeAdvantage and
 * lowScoreCorrelation, on the clubs' result-only elevens at the game's start. Like Série B–D they keep
 * Série A's strengthImpact and gapSaturation.
 */
const LEAGUE_ABROAD_PARAMS: Readonly<Record<string, EngineParams>> = {
  "ar-1": fitted(0.7932, 0.3595, -0.1807),
  "at-1": fitted(1.1398, 0.1297, -0.2396),
  "be-1": fitted(1.1723, 0.2166, -0.1262),
  "de-1": fitted(1.2656, 0.2102, -0.259),
  "de-2": fitted(1.2309, 0.2308, -0.0929),
  "es-1": fitted(0.931, 0.3555, -0.1139),
  "es-2": fitted(0.8746, 0.376, -0.124),
  "fr-1": fitted(1.131, 0.2088, -0.0789),
  "fr-2": fitted(1.0094, 0.2447, -0.1241),
  "gb-eng-1": fitted(1.2242, 0.2138, -0.0456),
  "gb-eng-2": fitted(1.022, 0.2367, -0.0646),
  "gb-sct-1": fitted(1.0501, 0.3234, -0.0936),
  "gb-sct-2": fitted(1.1172, 0.1701, -0.1523),
  "gr-1": fitted(1.0132, 0.2041, -0.1824),
  "it-1": fitted(1.0582, 0.1673, -0.1255),
  "it-2": fitted(0.9915, 0.2459, -0.28),
  "mx-1": fitted(1.0698, 0.3095, -0.1247),
  "nl-1": fitted(1.1741, 0.267, -0.2935),
  "no-1": fitted(1.2195, 0.2498, 0.008),
  "pl-1": fitted(1.0723, 0.2652, -0.1293),
  "pt-1": fitted(1.0133, 0.2504, -0.074),
  "tr-1": fitted(1.0476, 0.2988, -0.1659),
  "us-1": fitted(1.0831, 0.3048, -0.1194),
};

// The countries of the world by where their unfitted leagues borrow params from: CONMEBOL's, and UEFA's with Saudi Arabia.
const SOUTH_AMERICA: ReadonlySet<string> = new Set(["ar", "bo", "cl", "co", "ec", "pe", "py", "uy", "ve"]);
const EUROPE: ReadonlySet<string> = new Set(["gb-eng", "es", "it", "de", "fr", "pt", "nl", "tr", "be", "gb-sct", "at", "gr", "cz", "hr", "ua", "pl", "no", "sk", "si", "hu", "bg", "cy", "am", "il", "az", "sa"]);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[middle] ?? Number.NaN) : ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2;
}

/** Each param's median over the fitted European leagues of one level: top flights (0) or the levels below. */
function europeanMedian(isTopFlight: boolean): EngineParams {
  const leagues = Object.entries(LEAGUE_ABROAD_PARAMS)
    .filter(([key]) => EUROPE.has(key.slice(0, key.lastIndexOf("-"))) && key.endsWith("-1") === isTopFlight)
    .map(([, params]) => params);
  const of = (param: keyof EngineParams) => median(leagues.map((p) => p[param]));
  return { baseGoals: of("baseGoals"), homeAdvantage: of("homeAdvantage"), strengthImpact: of("strengthImpact"), gapSaturation: of("gapSaturation"), lowScoreCorrelation: of("lowScoreCorrelation") };
}

const EUROPEAN_MEDIAN = { top: europeanMedian(true), below: europeanMedian(false) };

/**
 * A league abroad's params, the same in the result-only tier and in the full tier: its own fit where
 * football-data.co.uk has its results. guess: a South American league without them plays like Brazil's
 * division of its level (Série A for a top flight, Série B below), a European or Saudi one like the median
 * fitted European league of its level, and a country outside the world's at Série A's calibration.
 */
export function paramsForLeagueAbroad(country: string, level: number): EngineParams {
  const own = LEAGUE_ABROAD_PARAMS[leagueAbroadKey(country, level)];
  if (own) return own;
  if (SOUTH_AMERICA.has(country)) return DIVISION_PARAMS[level === 0 ? "A" : "B"];
  if (EUROPE.has(country)) return level === 0 ? EUROPEAN_MEDIAN.top : EUROPEAN_MEDIAN.below;
  return CALIBRATED;
}
