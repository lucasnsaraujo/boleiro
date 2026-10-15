import type { Tactics } from "./coach/tactics.js";
import type { CoachEvent } from "./coach/coachEvent.js";
import type { DisciplineEvent } from "./discipline/discipline.js";
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

export type DayDecisions = {
  lineup?: readonly string[];
  /** The coach's formation, posture and penalty taker from today on. */
  tactics?: Tactics;
  /** The club whose open job offer the coach accepts today. */
  acceptOffer?: string;
  /** Transfer requests to the board, decided at the start of the next day. */
  requests?: readonly CoachRequest[];
};

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
  | TransferEvent;

/** One day of the game: today's matches with no live changes, then everything else the day brings. */
export function advanceDay(state: GameState, decisions: DayDecisions): { state: GameState; events: DayEvent[] } {
  return finishMatchDay(startMatchDay(state, decisions));
}
