import type { IsoDate } from "@boleiro/engine/sim/gameState";
import { windowClosesOn } from "@boleiro/engine/sim/transfers/transferWindows";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";

/** The time a coach has spent on the market screens in the transfer window that closes on `closesOn`. */
export type MarketClock = { closesOn: IsoDate; spentSeconds: number };

/** The market clock as the top bar shows it: the window's budget and what is left of it. */
export type MarketClockView = { budgetSeconds: number; leftSeconds: number };

function spentIn(clock: MarketClock | null, closesOn: IsoDate): number {
  return clock?.closesOn === closesOn ? clock.spentSeconds : 0;
}

/** The clock on `date`; null in a game without the clock or with no window open. Each window starts the budget over. */
export function marketClockView(clock: MarketClock | null, date: IsoDate, budgetSeconds: number | undefined): MarketClockView | null {
  const closesOn = windowClosesOn(date);
  if (budgetSeconds === undefined || closesOn === null) return null;
  return { budgetSeconds, leftSeconds: Math.max(0, budgetSeconds - spentIn(clock, closesOn)) };
}

/** The clock after `seconds` more on the market screens; it only runs while a window is open, and stops at the budget. */
export function spendMarketTime(clock: MarketClock | null, date: IsoDate, budgetSeconds: number | undefined, seconds: number): MarketClock | null {
  const closesOn = windowClosesOn(date);
  if (budgetSeconds === undefined || closesOn === null) return clock;
  return { closesOn, spentSeconds: Math.min(budgetSeconds, spentIn(clock, closesOn) + Math.max(0, seconds)) };
}

/** Whether the request brings a player in, which a coach whose clock has run out can't start any more; selling and renewing can. */
export function isSigning(request: CoachRequest): boolean {
  return request.kind === "sign" || request.kind === "loanIn";
}
