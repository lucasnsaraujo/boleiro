import type { Club } from "@boleiro/data/clubs";
import type { Tier } from "../gameState.js";

/** The division whose money rules a club follows. guess: a league abroad's top level follows Série A's, the levels below Série B's. */
export const tierOf = (club: Pick<Club, "division" | "abroad">): Tier => (club.abroad ? (club.abroad.level === 0 ? "A" : "B") : (club.division ?? "state"));
