import type { Club } from "../../data/clubs.js";
import type { Tier } from "../gameState.js";

export const tierOf = (club: Pick<Club, "division">): Tier => club.division ?? "state";
