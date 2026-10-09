import { bookMoney } from "../finances/bookMoney.js";
import { paySigningCosts } from "../finances/paySigningCosts.js";
import type { GameState, IsoDate, SimPlayer } from "../gameState.js";
import { withoutKey } from "./withoutKey.js";
import type { MoveKind, PlayerMoved } from "./transferEvents.js";
import type { Loan } from "./transferMarket.js";

export type Transfer = {
  playerId: string;
  kind: MoveKind;
  /** null when he leaves for abroad or becomes a free agent. */
  toClubId: string | null;
  /** Transfer fee in BRL. */
  fee: number;
  /** The new contract, when there is one. */
  contract?: { wage: number; until: IsoDate };
  loan?: Loan;
  /** A player coming from abroad, who is not in the game yet. */
  incoming?: SimPlayer;
};

// guess: luvas (the signing bonus) are three months' wages for a player who comes without a fee,
// one month for one bought from another club, who already cost a fee.
const SIGNING_BONUS_MONTHS: Partial<Record<MoveKind, number>> = { transfer: 1, loanBuy: 1, freeAgent: 3, preContract: 3, fromAbroad: 3 };
// FIFA Football Agent Regulations (2023) art. 15: an agent acting for the player takes at most 3% of
// his pay over the contract when it is above USD 200,000 a year (5% below; 3% used for every contract).
const AGENT_SHARE_OF_PAY = 0.03;

const monthsOf = (from: IsoDate, until: IsoDate) => Math.max(1, Math.round((Date.parse(until) - Date.parse(from)) / (30.4 * 86_400_000)));

/** Moves a player, books the fee and signing costs, and sets his new contract and arrival day. */
export function movePlayer(state: GameState, transfer: Transfer): { state: GameState; event: PlayerMoved } {
  const { playerId, kind, toClubId, fee, contract, loan } = transfer;
  const atClub = state.players[playerId];
  const player = atClub ?? state.market.freeAgents[playerId] ?? transfer.incoming;
  if (!player) throw new Error(`no player ${playerId}`);
  const fromClubId = atClub ? atClub.clubId : null;
  let next = state;
  if (fee > 0 && fromClubId) next = bookMoney(next, fromClubId, { revenue: "playerSales", amount: fee });
  if (fee > 0 && toClubId) next = bookMoney(next, toClubId, { cost: "transferFees", amount: fee });
  const bonusMonths = SIGNING_BONUS_MONTHS[kind];
  if (toClubId && contract && bonusMonths !== undefined) {
    const signingFee = Math.round(bonusMonths * contract.wage);
    const agentCommission = Math.round(AGENT_SHARE_OF_PAY * contract.wage * monthsOf(state.date, contract.until));
    next = paySigningCosts(next, toClubId, { signingFee, agentCommission });
    const finance = next.finances[toClubId];
    if (finance) {
      const transferBudget = Math.max(0, finance.transferBudget - fee - signingFee - agentCommission);
      next = { ...next, finances: { ...next.finances, [toClubId]: { ...finance, transferBudget } } };
    }
  }

  const players = withoutKey(next.players, playerId);
  const freeAgents = withoutKey(next.market.freeAgents, playerId);
  const preContracts = withoutKey(next.market.preContracts, playerId);
  const loans = withoutKey(next.market.loans, playerId);
  if (kind === "released") freeAgents[playerId] = player;
  else if (toClubId) {
    players[playerId] = {
      ...player,
      clubId: toClubId,
      wage: contract?.wage ?? player.wage,
      contractUntil: contract?.until ?? player.contractUntil,
      condition: { ...player.condition, arrivedOn: state.date },
    };
  }
  if (loan) loans[playerId] = loan;
  next = { ...next, players, market: { ...next.market, freeAgents, preContracts, loans } };
  return { state: next, event: { type: "playerMoved", kind, playerId, name: player.name, fromClubId, toClubId, fee } };
}
