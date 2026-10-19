import type { IsoDate } from "../gameState.js";
import type { EventArea } from "../events/eventMemory.js";
import type { Assistant, FormerPlayer } from "./assistant.js";
import type { AssistantDuty } from "./assistantDuties.js";
import type { MatchPlan } from "./matchPlan.js";
import type { Tactics } from "./tactics.js";

/** `salary` is monthly, in BRL; the contract runs to the end of `untilSeason`. */
export type CoachContract = { salary: number; untilSeason: number };

/** `isComeBack` marks a former club calling back the idol it lost. */
export type JobOffer = { clubId: string; salary: number; untilSeason: number; expiresOn: IsoDate; isComeBack?: true };

/** The player's coach. His club is `GameState.coachClubId`; `reputation` runs from 0 (unknown) to 100. */
export type Coach = {
  reputation: number;
  careerMode: boolean;
  contract: CoachContract | null;
  offers: JobOffer[];
  /** Kept from match to match until the coach changes them. */
  tactics: Tactics;
  /** What his matches do without stopping (matchPlan.ts); left out, nothing: every red card and injury asks him. */
  matchPlan?: MatchPlan;
  /** The last day of the window the coach got for himself when he took a club outside the game's windows. */
  personalWindowUntil?: IsoDate;
  /** The areas whose events the assistant answers for him at once; left out, every event asks the coach. */
  assistantAreas?: EventArea[];
  /** True when the coach picks his club's sponsors himself; left out, the board signs the best offer on its day. */
  picksSponsors?: true;
  /** Clubs he walked out on, which won't hire him again before the end of `untilSeason`; a coach who never resigned has none. */
  cooldowns?: { clubId: string; untilSeason: number }[];
  /** The duties he set apart from their defaults (assistantDuties.ts); left out, the assistant runs the defaults. */
  assistantDuties?: Partial<Record<AssistantDuty, boolean>>;
  /** The assistant he hired; left out, his club's own level-1 assistant (assistant.ts). */
  assistant?: Assistant;
  /** The last players who retired at his club, who may come back as his assistant. */
  formerPlayers?: FormerPlayer[];
  /** The day he hung up his clipboard: no club, and no club calls him again. A coach still working has none. */
  retiredOn?: IsoDate;
};

/** Whether the club still holds the coach's resignation against him. */
export function isCoolingDown(coach: Pick<Coach, "cooldowns">, clubId: string, season: number): boolean {
  return coach.cooldowns?.some((cooldown) => cooldown.clubId === clubId && cooldown.untilSeason >= season) ?? false;
}

// guess: an unknown coach starts at the reputation of the smallest national clubs.
export const CAREER_START_REPUTATION = 5;
// guess: clubs offer the job to a coach whose reputation is at most this many stature points below their own.
export const OFFER_REACH = 15;
