import type { Tactics } from "./coach/tactics.js";
import type { CoachEvent } from "./coach/coachEvent.js";
import type { DisciplineEvent } from "./discipline/discipline.js";
import type { EventDayEvent } from "./events/runEvents.js";
import type { FinanceEvent } from "./finances/closeMonth.js";
import type { PrizePaid } from "./finances/payCopaPrizes.js";
import type { TitleBonusPaid } from "./finances/payTitleBonuses.js";
import type { FriendlyEvent } from "./friendlies/friendlies.js";
import type { Fixture, GameState } from "./gameState.js";
import type { LeagueOutcome } from "./leagueFormats.js";
import { finishMatchDay } from "./live/finishMatchDay.js";
import { startMatchDay } from "./live/startMatchDay.js";
import type { SupporterEvent } from "./morale/escalateSupporters.js";
import type { PlayerRetired, YouthPromoted } from "./players/developPlayers.js";
import type { PlayerInjured } from "./players/recordMatchLoad.js";
import type { StadiumOpened } from "./stadium/stadiumWorks.js";
import type { CoachRequest } from "./transfers/coachRequest.js";
import type { TransferEvent } from "./transfers/transferEvents.js";
import type { CopinhaPlayed } from "./youth/copinha.js";
import type { SquadToppedUp } from "./youth/fillShortSquads.js";
import type { YouthEvent } from "./youth/turnOverAcademies.js";

export type DayDecisions = {
  lineup?: readonly string[];
  /** The coach's formation, posture and penalty taker from today on. */
  tactics?: Tactics;
  /** The club whose open job offer the coach accepts today. */
  acceptOffer?: string;
  /** Transfer requests to the board, decided at the start of the next day. */
  requests?: readonly CoachRequest[];
  /** Each waiting hot-seat coach's choices, made on his turn, in waiting order (`GameState.waitingCoaches`). */
  waiting?: readonly WaitingDecisions[];
};

/** A waiting hot-seat coach's choices for the day: his eleven and tactics, the offer he takes and his requests. */
export type WaitingDecisions = Omit<DayDecisions, "waiting">;

export type DayEvent =
  | { type: "matchPlayed"; fixture: Fixture }
  | { type: "stageOpened"; competitionId: string; stage: number }
  | { type: "seasonEnded"; season: number; outcomes: Record<string, LeagueOutcome> }
  | FinanceEvent
  | PlayerInjured
  | DisciplineEvent
  | PlayerRetired
  | YouthPromoted
  | PrizePaid
  | FriendlyEvent
  | TitleBonusPaid
  | SupporterEvent
  | StadiumOpened
  | CoachEvent
  | TransferEvent
  | YouthEvent
  | CopinhaPlayed
  | SquadToppedUp
  | EventDayEvent;

/** A day played: the game after it and its events; in a hot-seat game, each waiting coach's own news apart, in waiting order. */
export type DayResult = { state: GameState; events: DayEvent[]; waitingEvents?: DayEvent[][] };

/** One day of the game: today's matches with no live changes, then everything else the day brings. */
export function advanceDay(state: GameState, decisions: DayDecisions): DayResult {
  return finishMatchDay(startMatchDay(state, decisions));
}
