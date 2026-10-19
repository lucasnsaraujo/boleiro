import { OPENING_EUR_BRL } from "./openingMarket.js";
import { exp, log, cos } from "../portableMath.js";

// The 2025 monthly EUR/BRL PTAX averages moved between 6.01 and 6.48 (BCB series 21619 via
// numerando.com.br), about 2.5% a month. guess: the rate pulls a tenth of the way back to 6.31 each month.
const MONTHLY_SD = 0.025;
const PULL_TO_MEAN = 0.1;

function normal(random: () => number): number {
  return Math.sqrt(-2 * log(1 - random())) * cos(2 * Math.PI * random());
}

/** Next month's BRL per EUR. */
export function driftExchangeRate(eurBrl: number, random: () => number): number {
  const logRate = log(eurBrl);
  const next = logRate + PULL_TO_MEAN * (log(OPENING_EUR_BRL) - logRate) + MONTHLY_SD * normal(random);
  return Math.round(exp(next) * 10_000) / 10_000;
}
