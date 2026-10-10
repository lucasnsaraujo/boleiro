import type { PositionGroup } from "../../src/engine/match.js";
import type { Trait } from "../../src/sim/players/playerProfile.js";

export const POSITION_GROUP_NAMES: Record<PositionGroup, string> = { GK: "Goleiros", DEF: "Defensores", MID: "Meio-campistas", ATT: "Atacantes" };

export const POSITION_NAMES: Record<PositionGroup, string> = { GK: "Goleiro", DEF: "Defensor", MID: "Meio-campista", ATT: "Atacante" };

/** A trait as one word in a squad list. */
export const TRAIT_SHORT: Record<Trait, string> = { injuryProne: "Frágil", poorOnArtificialTurf: "Sintético", aggressive: "Faltoso" };

/** A trait as a line on the player's own screen. */
export const TRAIT_LONG: Record<Trait, string> = {
  injuryProne: "Se machuca com facilidade",
  poorOnArtificialTurf: "Rende menos na grama sintética",
  aggressive: "Faltoso, leva muito cartão",
};
