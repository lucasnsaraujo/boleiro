import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { Trait } from "@boleiro/engine/sim/players/playerProfile";

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

/** Brasfoot's position letters, on the album's position colours. */
export const POSITION_BADGES: Record<PositionGroup, { letter: string; colour: string }> = {
  GK: { letter: "G", colour: "G" },
  DEF: { letter: "D", colour: "Z" },
  MID: { letter: "M", colour: "M" },
  ATT: { letter: "A", colour: "A" },
};
