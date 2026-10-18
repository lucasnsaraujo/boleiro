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

/** How the coach prices a player he puts up for sale: high and waiting for a buyer, or low to sell soon. */
export type ListingMode = "expensive" | "cheap";

/** One of the coach's players for sale at `price` BRL, set by the mode he picked. */
export type Listing = { mode: ListingMode; price: number };

/**
 * A club's offer for one of the coach's players, waiting for his answer until the end of `until`.
 * `buyerId` null is a club abroad, whose offer is also kept in EUR. In a hot-seat game it may be another
 * human coach's offer, which is his last word.
 */
export type Bid = {
  playerId: string;
  buyerId: string | null;
  /** Fee in BRL. */
  fee: number;
  feeEur: number | null;
  /** The most the buyer would pay; a counter-offer up to it closes the deal. The coach never sees it. */
  ceiling: number;
  /** The buyer's last word after a counter-offer: take it or leave it. */
  isFinal: boolean;
  madeOn: IsoDate;
  until: IsoDate;
  /** The contract the player agreed with another human coach whose offer this is; a club's own offer sets it on the day of the sale. */
  contract?: { wage: number; until: IsoDate };
};

/** A club's bid in one of the coach's auctions, in BRL. */
export type AuctionBid = { clubId: string; fee: number; date: IsoDate };

/** One of the coach's players at auction: clubs bid from `minBid` up, and the best bid takes him on `closesOn`. */
export type Auction = { minBid: number; closesOn: IsoDate; bids: AuctionBid[] };

/** A selling club's answer to an offer of the coach that was too low: it sells for `fee` BRL until the end of `until`. */
export type Counter = { clubId: string; fee: number; until: IsoDate };

/**
 * One of the coach's players answering a renewal offered too low: he signs for `months` at `wage` BRL a month
 * until the end of `until`, while his contract still ends on `contractUntil`, the day it ended when he answered.
 */
export type RenewalCounter = { months: number; wage: number; until: IsoDate; contractUntil: IsoDate };

/**
 * The coach's own business, keyed by player id: his players for sale or at auction, clubs' offers for them,
 * sellers' counters to his offers, and his players' counters to his renewal offers (absent until the first).
 */
export type CoachMarket = {
  listings: Record<string, Listing>;
  auctions: Record<string, Auction>;
  bids: Record<string, Bid>;
  counters: Record<string, Counter>;
  renewalCounters?: Record<string, RenewalCounter>;
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
  /** Absent until the coach first lists a player or a club bids for one, so older saves read as they are. */
  coach?: CoachMarket;
};
