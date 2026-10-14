import type { IsoDate, SimPlayer } from "../gameState.js";

/** A player on loan: his `clubId` is the borrower until `until`, then he goes back to `fromClubId`. */
export type Loan = {
  fromClubId: string;
  until: IsoDate;
  /** Share of his wage the lending club keeps paying. */
  lenderWageShare: number;
  /** Fee in BRL for which the borrower may buy him, or null when there is no purchase clause. */
  buyOption: number | null;
};

/** The transfer market's own state. */
export type TransferMarket = {
  /** Seeded stream for market decisions, so they never reshuffle matches or finances. */
  rngState: number;
  /** BRL per EUR; drifts every month. */
  eurBrl: number;
  /** Players without a club, keyed by id; their `clubId` is the club they last left. */
  freeAgents: Record<string, SimPlayer>;
  /** Player id → club he joins for free when his contract ends. */
  preContracts: Record<string, string>;
  /** Player id → his current loan. */
  loans: Record<string, Loan>;
};
