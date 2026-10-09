import type { IsoDate } from "../gameState.js";
import type { CoachRequest } from "./coachRequest.js";

/**
 * How a player changed clubs. `abroad` is a sale to Europe, `fromAbroad` a signing from a club
 * outside Brazil, `released` a contract that ended with nobody waiting.
 */
export type MoveKind = "transfer" | "freeAgent" | "preContract" | "abroad" | "fromAbroad" | "loan" | "loanReturn" | "loanBuy" | "released";

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
};
export type ContractRenewed = { type: "contractRenewed"; playerId: string; clubId: string; until: IsoDate; wage: number };
export type PreContractSigned = { type: "preContractSigned"; playerId: string; fromClubId: string; toClubId: string };
export type EuropeBid = { type: "europeBid"; playerId: string; clubId: string; feeEur: number; fee: number; accepted: boolean };
/** The board's answer to one coach request; `reason` says why it refused. */
export type RequestDecided = { type: "requestDecided"; request: CoachRequest; approved: boolean; reason: string | null };

export type TransferEvent = PlayerMoved | ContractRenewed | PreContractSigned | EuropeBid | RequestDecided;
