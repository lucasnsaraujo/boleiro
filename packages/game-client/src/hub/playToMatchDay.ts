import { addDays } from "@boleiro/engine/sim/dates";
import type { GameState } from "@boleiro/engine/sim/gameState";
import { isWindowOpen } from "@boleiro/engine/sim/transfers/transferWindows";
import { inboxLines, type DayEvent, type InboxLine } from "./inboxLines.js";

/** Why the days stopped: the coach's match, something he must see, or the day limit. */
export type StopReason = "matchDay" | "jobOffer" | "fired" | "boardDecision" | "bidReceived" | "windowClosing" | "seasonEnd" | "idle";

/** One day played; `stop` is a reason the day must stop for someone else than the coach in the seat (a hot-seat coach waiting his turn). */
export type PlayDay = (state: GameState) => { state: GameState; events: DayEvent[]; stop?: StopReason | null };
export type PlayedDays = { state: GameState; news: InboxLine[]; stop: StopReason; daysPlayed: number };

const WINDOW_WARNING = "Último dia para pedir reforços: a janela fecha amanhã";

// guess: about four months, longer than any gap between a club's games inside a season, so only a
// coach without a club waiting for offers reaches it.
const MAX_DAYS = 120;

export function isCoachMatchDay({ date, coachClubId, fixtures }: Pick<GameState, "date" | "coachClubId" | "fixtures">): boolean {
  return coachClubId !== null && fixtures.some((f) => f.date === date && !f.result && (f.homeId === coachClubId || f.awayId === coachClubId));
}

/**
 * Requests are decided the morning after the coach makes them, so the last day to ask is the day
 * before the window's last day.
 */
function isLastDayToAsk(date: string): boolean {
  return isWindowOpen(addDays(date, 1)) && !isWindowOpen(addDays(date, 2));
}

/** Whether the day just played, from `before` to `after`, needs the coach before the game goes on. */
export function stopReason(before: GameState, after: GameState, events: readonly DayEvent[]): StopReason | null {
  if (events.some((e) => e.type === "coachFired" && e.isYou)) return "fired";
  if (events.some((e) => e.type === "jobOffered")) return "jobOffer";
  const isBoardDecision = (e: DayEvent) => e.type === "requestDecided" || (e.type === "forcedSale" && e.clubId === before.coachClubId);
  if (events.some(isBoardDecision)) return "boardDecision";
  // A club's offer for one of his players lapses in two days, so it can't wait for the next match.
  if (events.some((e) => e.type === "bidReceived")) return "bidReceived";
  if (events.some((e) => e.type === "seasonEnded")) return "seasonEnd";
  if (isCoachMatchDay(after)) return "matchDay";
  if (after.coachClubId && isLastDayToAsk(after.date)) return "windowClosing";
  return null;
}

/**
 * Plays days until the coach's next match day, stopping early when a day brings something he
 * must see. On a match day it plays nothing; otherwise it always plays at least one day. In a
 * hot-seat game `isMatchDay` asks for any human coach's match.
 */
export function playToMatchDay(start: GameState, playDay: PlayDay, maxDays = MAX_DAYS, isMatchDay: (state: GameState) => boolean = isCoachMatchDay): PlayedDays {
  if (isMatchDay(start)) return { state: start, news: [], stop: "matchDay", daysPlayed: 0 };
  let state = start;
  const news: InboxLine[] = [];
  for (let day = 1; day <= maxDays; day++) {
    const played = playDay(state);
    news.push(...inboxLines(state, played.state, played.events));
    const stop = stopReason(state, played.state, played.events) ?? played.stop ?? null;
    state = played.state;
    // The warning also goes out when another reason stops the days on the last day to ask.
    if (state.coachClubId && isLastDayToAsk(state.date)) news.push({ date: state.date, text: WINDOW_WARNING, tone: "neutral" });
    if (stop) return { state, news, stop, daysPlayed: day };
  }
  return { state, news, stop: "idle", daysPlayed: maxDays };
}
