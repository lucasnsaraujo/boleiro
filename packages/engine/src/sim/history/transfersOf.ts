import type { DayEvent } from "../advanceDay.js";
import type { GameState } from "../gameState.js";
import type { Transfer } from "./recordTransfer.js";

/** A paid move; `fromId` is null for a signing from abroad. */
export type PaidMove = Omit<Transfer, "fromId"> & { fromId: string | null };

/**
 * The paid, permanent moves in a day's events: board fire sales and market transfers (loans excluded).
 * `before` is the state the day started from: it still knows players sold abroad.
 */
export function transfersOf(events: readonly DayEvent[], before: GameState): PaidMove[] {
  const at = { season: before.season, date: before.date };
  return events.flatMap((event): PaidMove[] => {
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
