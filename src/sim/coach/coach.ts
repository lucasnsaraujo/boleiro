import type { IsoDate } from "../gameState.js";
import type { Tactics } from "./tactics.js";

/** `salary` is monthly, in BRL; the contract runs to the end of `untilSeason`. */
export type CoachContract = { salary: number; untilSeason: number };

export type JobOffer = { clubId: string; salary: number; untilSeason: number; expiresOn: IsoDate };

/** The player's coach. His club is `GameState.coachClubId`; `reputation` runs from 0 (unknown) to 100. */
export type Coach = {
  reputation: number;
  careerMode: boolean;
  contract: CoachContract | null;
  offers: JobOffer[];
  /** Kept from match to match until the coach changes them. */
  tactics: Tactics;
};

// guess: an unknown coach starts at the reputation of the smallest national clubs.
export const CAREER_START_REPUTATION = 5;
// guess: clubs offer the job to a coach whose reputation is at most this many stature points below their own.
export const OFFER_REACH = 15;
