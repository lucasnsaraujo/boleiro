/**
 * The paid, permanent moves in a day's events: board fire sales and market transfers (loans excluded).
 * `before` is the state the day started from: it still knows players sold abroad.
 */
export function transfersOf(events, before) {
    const at = { season: before.season, date: before.date };
    return events.flatMap((event) => {
        if (event.type === "forcedSale") {
            const name = before.players[event.playerId]?.name ?? event.playerId;
            return [{ ...at, playerId: event.playerId, name, fromId: event.clubId, toId: event.buyerId, fee: event.fee }];
        }
        if (event.type === "playerMoved" && event.fee > 0 && event.kind !== "loan") {
            return [{ ...at, playerId: event.playerId, name: event.name, fromId: event.fromClubId, toId: event.toClubId, fee: event.fee }];
        }
        return [];
    });
}
