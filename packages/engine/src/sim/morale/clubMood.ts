import type { GameState } from "../gameState.js";

/** How far a club's organised supporters (torcida organizada) have escalated, calmest first. */
export const SUPPORTER_STEPS = ["calm", "pressure", "protest", "violence"] as const;
export type SupporterStep = (typeof SUPPORTER_STEPS)[number];

/** A club's emotional state. Morale and fan mood run from 0 to 100; 50 is neutral. */
export type ClubMood = {
  /** Squad morale; it nudges how strong the players play. */
  squad: number;
  /** How the fans feel; it drives the organised supporters and the crowd. */
  fans: number;
  supporters: SupporterStep;
  /** Home games still to be played behind closed doors, by sports court order. */
  closedDoorGames: number;
};

export const NEUTRAL_MOOD: ClubMood = { squad: 50, fans: 50, supporters: "calm", closedDoorGames: 0 };

/** A club's mood as the board, the coach career and the UI read it. */
export function clubMood(state: Pick<GameState, "mood">, clubId: string): ClubMood {
  return state.mood[clubId] ?? NEUTRAL_MOOD;
}
