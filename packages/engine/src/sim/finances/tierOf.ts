import type { Club } from "@boleiro/data/clubs";
import type { Division } from "@boleiro/data/players";
import type { Tier } from "../gameState.js";

/**
 * The Brazilian division a club stands level with: its own, or for a club abroad (guess) Série A for
 * its league's top level and Série B for the levels below; null for a state-only club.
 */
export const divisionOf = (club: Pick<Club, "division" | "abroad">): Division | null => (club.abroad ? (club.abroad.level === 0 ? "A" : "B") : club.division);

/** The division whose money rules a club follows. */
export const tierOf = (club: Pick<Club, "division" | "abroad">): Tier => divisionOf(club) ?? "state";
