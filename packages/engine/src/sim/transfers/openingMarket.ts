import type { TransferMarket } from "./transferMarket.js";

// Average EUR/BRL PTAX of 2025, Banco Central do Brasil series 21619 (via numerando.com.br/cambio/euro/2025).
export const OPENING_EUR_BRL = 6.31;
// The market's random stream is salted from the game seed so it never shares draws with matches.
const MARKET_STREAM_SALT = 0x7e4a5;

export function openingMarket(seed: number): TransferMarket {
  return { rngState: (seed ^ MARKET_STREAM_SALT) >>> 0, eurBrl: OPENING_EUR_BRL, freeAgents: {}, preContracts: {}, loans: {} };
}
