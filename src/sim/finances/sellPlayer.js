import { bookMoney } from "./bookMoney.js";
/**
 * Moves a player to `buyerId` for `fee` BRL, or abroad when `buyerId` is null (he leaves the game).
 * The seller books the fee as player sales and the buyer as a transfer fee.
 */
export function sellPlayer(state, sale) {
    const player = state.players[sale.playerId];
    if (!player)
        throw new Error(`no player ${sale.playerId}`);
    const players = sale.buyerId
        ? { ...state.players, [sale.playerId]: { ...player, clubId: sale.buyerId } }
        : Object.fromEntries(Object.entries(state.players).filter(([id]) => id !== sale.playerId));
    const sold = bookMoney({ ...state, players }, player.clubId, { revenue: "playerSales", amount: sale.fee });
    return sale.buyerId ? bookMoney(sold, sale.buyerId, { cost: "transferFees", amount: sale.fee }) : sold;
}
