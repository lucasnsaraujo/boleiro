import type { Club } from "@boleiro/data/clubs";
import type { Tier } from "../gameState.js";

export const tierOf = (club: Pick<Club, "division">): Tier => club.division ?? "state";
