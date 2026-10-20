import { OPENING_EUR_BRL } from "./openingMarket.js";
// The 2025 monthly EUR/BRL PTAX averages moved between 6.01 and 6.48 (BCB series 21619 via
// numerando.com.br), about 2.5% a month. guess: the rate pulls a tenth of the way back to 6.31 each month.
const MONTHLY_SD = 0.025;
const PULL_TO_MEAN = 0.1;
function normal(random) {
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
/** Next month's BRL per EUR. */
export function driftExchangeRate(eurBrl, random) {
    const log = Math.log(eurBrl);
    const next = log + PULL_TO_MEAN * (Math.log(OPENING_EUR_BRL) - log) + MONTHLY_SD * normal(random);
    return Math.round(Math.exp(next) * 10_000) / 10_000;
}
