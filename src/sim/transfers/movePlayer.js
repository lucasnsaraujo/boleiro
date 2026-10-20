import { copyRecord } from "../copyRecord.js";
import { bookMoney } from "../finances/bookMoney.js";
import { paySigningCosts } from "../finances/paySigningCosts.js";
import { reactToIdolSale } from "../morale/reactToIdolSale.js";
// guess: luvas (the signing bonus) are three months' wages for a player who comes without a fee,
// one month for one bought from another club, who already cost a fee.
const SIGNING_BONUS_MONTHS = { transfer: 1, loanBuy: 1, freeAgent: 3, preContract: 3, fromAbroad: 3 };
// FIFA Football Agent Regulations (2023) art. 15: an agent acting for the player takes at most 3% of
// his pay over the contract when it is above USD 200,000 a year (5% below; 3% used for every contract).
const AGENT_SHARE_OF_PAY = 0.03;
const monthsOf = (from, until) => Math.max(1, Math.round((Date.parse(until) - Date.parse(from)) / (30.4 * 86_400_000)));
/**
 * A copy of the state whose players and market maps can be edited in place. Copying them once per
 * market day instead of once per move keeps a busy window day cheap.
 */
export function openDraft(state) {
    const { market } = state;
    return {
        ...state,
        players: copyRecord(state.players),
        market: { ...market, freeAgents: { ...market.freeAgents }, preContracts: { ...market.preContracts }, loans: { ...market.loans } },
    };
}
/**
 * Moves a player, books the fee and signing costs, and sets his new contract and arrival day.
 * `state` must be a draft (openDraft): its players and market maps are changed in place.
 * `squadOf`, when given, returns a club's current squad (see reactToIdolSale).
 */
export function movePlayer(state, transfer, squadOf) {
    const { playerId, kind, toClubId, fee, contract, loan } = transfer;
    const atClub = state.players[playerId];
    const player = atClub ?? state.market.freeAgents[playerId] ?? transfer.incoming;
    if (!player)
        throw new Error(`no player ${playerId}`);
    const fromClubId = atClub ? atClub.clubId : null;
    const isSale = fromClubId !== null && fee > 0 && (kind === "transfer" || kind === "abroad");
    // Fans react while the player is still in the squad, so they can tell an idol from a reserve.
    let next = isSale ? reactToIdolSale(state, playerId, squadOf) : state;
    if (fee > 0 && fromClubId)
        next = bookMoney(next, fromClubId, { revenue: "playerSales", amount: fee });
    if (fee > 0 && toClubId)
        next = bookMoney(next, toClubId, { cost: "transferFees", amount: fee });
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
    // The draft's own maps are edited in place; see openDraft.
    const { players, market } = next;
    Reflect.deleteProperty(players, playerId);
    Reflect.deleteProperty(market.freeAgents, playerId);
    Reflect.deleteProperty(market.preContracts, playerId);
    Reflect.deleteProperty(market.loans, playerId);
    if (kind === "released")
        market.freeAgents[playerId] = player;
    else if (toClubId) {
        players[playerId] = {
            ...player,
            clubId: toClubId,
            wage: contract?.wage ?? player.wage,
            contractUntil: contract?.until ?? player.contractUntil,
            condition: { ...player.condition, arrivedOn: state.date },
        };
    }
    if (loan)
        market.loans[playerId] = loan;
    return { state: next, event: { type: "playerMoved", kind, playerId, name: player.name, fromClubId, toClubId, fee } };
}
