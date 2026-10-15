import { humanClubIds, waitingCoachesOf } from "@boleiro/engine/sim/coach/humanCoaches";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { DayEvent } from "./inboxLines.js";
import { isCoachMatchDay } from "./playToMatchDay.js";

/** A hot-seat game's coaches in turn order, who sits now, and who of them plays today. */
export type HotSeatView = {
  coaches: { name: string; clubId: string | null; playsToday: boolean }[];
  /** The place in turn order of the coach in the seat. */
  seated: number;
  /** Whether the coach in the seat is the last of the turn, whose play runs the day for everyone. */
  isLastTurn: boolean;
};

type SeatState = Pick<GameState, "date" | "fixtures" | "coachClubId" | "coachName" | "waitingCoaches">;

/** The coaches in turn order, from the game with the coach at place `seated` in the seat. */
export function hotSeatViewOf(state: SeatState, seated: number): HotSeatView | null {
  const waiting = waitingCoachesOf(state);
  if (!waiting.length) return null;
  const count = waiting.length + 1;
  const plays = (clubId: string | null) => isCoachMatchDay({ date: state.date, fixtures: state.fixtures, coachClubId: clubId });
  const coaches = Array.from({ length: count }, (): HotSeatView["coaches"][number] => ({ name: "", clubId: null, playsToday: false }));
  coaches[seated] = { name: state.coachName ?? "", clubId: state.coachClubId, playsToday: plays(state.coachClubId) };
  waiting.forEach((coach, index) => {
    coaches[(seated + 1 + index) % count] = { name: coach.name, clubId: coach.clubId, playsToday: plays(coach.clubId) };
  });
  return { coaches, seated, isLastTurn: seated === count - 1 };
}

/** Whether any human coach's club plays today. */
export function isHumanMatchDay(state: Pick<GameState, "date" | "fixtures" | "coachClubId" | "waitingCoaches">): boolean {
  return humanClubIds(state).some((clubId) => isCoachMatchDay({ date: state.date, fixtures: state.fixtures, coachClubId: clubId }));
}

/** What a coach hears of his own: his board, his business and his career. A day's events carry these for the coach in the seat only. */
function isOwnNews(event: DayEvent): boolean {
  switch (event.type) {
    case "requestDecided":
    case "bidReceived":
    case "auctionClosed":
    case "counterOffered":
    case "coachHired":
    case "jobOffered":
    case "coachSeasonReviewed":
    case "contractRenewed":
    case "contractEnded":
      return true;
    case "coachFired":
      return event.isYou;
    default:
      return false;
  }
}

/** A day's events as a waiting coach lives them: the day's own, without the seated coach's news, and his own news. */
export function eventsOfWaitingCoach(events: readonly DayEvent[], own: readonly DayEvent[] = []): DayEvent[] {
  return [...events.filter((event) => !isOwnNews(event)), ...own];
}
