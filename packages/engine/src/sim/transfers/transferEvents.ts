import type { IsoDate } from "../gameState.js";
import type { CoachRequest } from "./coachRequest.js";

/**
 * How a player changed clubs. `abroad` is a sale to Europe, `fromAbroad` a signing from a club
 * outside Brazil, `released` a contract that ended with nobody waiting, `releaseClause` a buyer who paid the clause.
 */
export type MoveKind = "transfer" | "freeAgent" | "preContract" | "abroad" | "fromAbroad" | "loan" | "loanReturn" | "loanBuy" | "released" | "releaseClause";

export type PlayerMoved = {
  type: "playerMoved";
  kind: MoveKind;
  playerId: string;
  name: string;
  /** null for a free agent or a player from abroad. */
  fromClubId: string | null;
  /** null when he goes abroad or becomes a free agent. */
  toClubId: string | null;
  /** Transfer fee in BRL. */
  fee: number;
  /** A human coach's assistant took the offer for him (assistantSales). */
  byAssistant?: true;
};
/** A contract extended to `until` at `wage` BRL a month; `byAssistant` when a human coach's assistant did it for him. */
export type PlayerContractRenewed = { type: "playerContractRenewed"; playerId: string; clubId: string; until: IsoDate; wage: number; byAssistant?: true };
/** A player's answer to a renewal offered too low: he signs for `months` at `wage` BRL a month. */
export type RenewalCountered = { type: "renewalCountered"; playerId: string; months: number; wage: number };
/** Why a human coach's assistant left a contract running out: the player is not in the club's plans, he agrees to no length, or the wage cap has no room. */
export type RenewalSkipReason = "notInPlans" | "playerUnwilling" | "wageCap";
/** A human coach's assistant looked at a contract ending on `until` and didn't renew it. */
export type RenewalSkipped = { type: "renewalSkipped"; playerId: string; clubId: string; until: IsoDate; reason: RenewalSkipReason };
export type PreContractSigned = { type: "preContractSigned"; playerId: string; fromClubId: string; toClubId: string };
export type EuropeBid = { type: "europeBid"; playerId: string; clubId: string; feeEur: number; fee: number; accepted: boolean };
/** The board's answer to one coach request; `reason` says why it refused. */
export type RequestDecided = { type: "requestDecided"; request: CoachRequest; approved: boolean; reason: string | null };
/** A club's offer for one of the coach's players, now waiting for his answer; `buyerId` null is a club abroad. */
export type BidReceived = { type: "bidReceived"; playerId: string; buyerId: string | null; fee: number };
/** One of the coach's auctions ended: sold to its best bid (a `playerMoved` comes with it), or without any. */
export type AuctionClosed = { type: "auctionClosed"; playerId: string; sold: boolean };
/** The seller's answer to an offer of the coach that was too low: it would sell for `fee`. */
export type CounterOffered = { type: "counterOffered"; playerId: string; clubId: string; fee: number };

export type TransferEvent =
  | PlayerMoved
  | PlayerContractRenewed
  | RenewalCountered
  | RenewalSkipped
  | PreContractSigned
  | EuropeBid
  | RequestDecided
  | BidReceived
  | AuctionClosed
  | CounterOffered;
