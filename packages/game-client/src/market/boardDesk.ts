import { addDays } from "@boleiro/engine/sim/dates";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { isWindowOpen, type CoachWindows } from "@boleiro/engine/sim/transfers/transferWindows";
import type { DayEvent } from "../hub/inboxLines.js";
import { needsWindow } from "./coachRequests.js";

/** The board's answer to one request, with the player's name as it was that day. */
export type BoardAnswer = { date: IsoDate; request: CoachRequest; name: string; approved: boolean; reason: string | null };
/** A player the board sold without asking because wages were late. `buyerId` null is a sale abroad. */
export type ForcedSaleNote = { date: IsoDate; name: string; buyerId: string | null; fee: number };
/** What sits on the board's desk: the coach's requests not yet decided, its answers and its forced sales, newest last. */
export type BoardDesk = { pending: CoachRequest[]; answers: BoardAnswer[]; forcedSales: ForcedSaleNote[] };

type DeskState = Pick<GameState, "date" | "coachClubId" | "players" | "market">;

export const EMPTY_DESK: BoardDesk = { pending: [], answers: [], forcedSales: [] };

/** The pending requests with this one added; a newer request for the same player replaces the old one. */
export function withRequest(pending: readonly CoachRequest[], request: CoachRequest): CoachRequest[] {
  return [...pending.filter((r) => r.playerId !== request.playerId), request];
}

/**
 * The requests to hand the board today, and those that wait. The board decides the morning after,
 * so a request that needs the window waits until that morning falls inside it.
 */
export function dueRequests(state: DeskState & CoachWindows, pending: readonly CoachRequest[]): { due: CoachRequest[]; waiting: CoachRequest[] } {
  const isOpenTomorrow = isWindowOpen(state, addDays(state.date, 1));
  const due: CoachRequest[] = [];
  const waiting: CoachRequest[] = [];
  for (const request of pending) (isOpenTomorrow || !needsWindow(state, request) ? due : waiting).push(request);
  return { due, waiting };
}

/** The board's answers and forced sales one day brought the coach's club. */
export function boardNotes(before: DeskState, after: DeskState, events: readonly DayEvent[]): Pick<BoardDesk, "answers" | "forcedSales"> {
  const nameOf = (playerId: string) =>
    before.players[playerId]?.name ?? before.market.freeAgents[playerId]?.name ?? after.players[playerId]?.name ?? after.market.freeAgents[playerId]?.name ?? "";
  const answers: BoardAnswer[] = [];
  const forcedSales: ForcedSaleNote[] = [];
  for (const event of events) {
    if (event.type === "requestDecided") {
      const { request, approved, reason } = event;
      answers.push({ date: before.date, request, name: nameOf(request.playerId), approved, reason });
    } else if (event.type === "forcedSale" && event.clubId === before.coachClubId) {
      forcedSales.push({ date: before.date, name: nameOf(event.playerId), buyerId: event.buyerId, fee: event.fee });
    }
  }
  return { answers, forcedSales };
}
