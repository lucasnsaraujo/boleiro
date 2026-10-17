import type { Role } from "@boleiro/data/players";
import { FORMATIONS, positionFit, SECONDARY_POSITION, type Formation } from "../../engine/formations.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { isInjured } from "../players/isInjured.js";
import { matchClubOf } from "../players/matchSetup.js";
import { pickMatchLineup } from "../players/pickMatchLineup.js";
import { usualStartersOf } from "../players/usualLineups.js";

/** A player as the assistant rates him: his strength as the assistant reads it. */
export type ReadPlayer = { playerId: string; name: string; age: number; read: number };

/** The starter the assistant reads weakest, in the slot he plays, and the best other player of the squad for that position. */
export type WeakSpot = ReadPlayer & { role: Role; backup: ReadPlayer | null };

/** A starter of the assistant's eleven, in the slot he plays. */
export type ReadStarter = ReadPlayer & { role: Role };

type Read = (playerId: string, strength: number) => number;

const rated = (read: Read) => (p: Pick<SimPlayer, "id" | "name" | "age" | "strength">): ReadPlayer => ({ playerId: p.id, name: p.name, age: p.age, read: read(p.id, p.strength) });

/**
 * The eleven the assistant would field today in `formation`, keeper first in its slots' order, each
 * starter rated by `read` (assistantReadOf); empty for a squad without a full eleven.
 */
export function assistantEleven(state: GameState, clubId: string, formation: Formation, read: Read): ReadStarter[] {
  const club = matchClubOf(state, clubId);
  if (!club) return [];
  const squad = Object.values(state.players).filter((p) => p.clubId === clubId);
  const eleven = pickMatchLineup(squad, { date: state.date, pitch: club.pitch }, formation, usualStartersOf(state, clubId));
  const slots = FORMATIONS[formation];
  if (eleven.length !== slots.length) return [];
  return eleven.flatMap((player, slot): ReadStarter[] => {
    const role = slots[slot]?.role;
    return role ? [{ ...rated(read)(player), role }] : [];
  });
}

/**
 * The weakest spot of the club's eleven as the assistant sees it: the starter of assistantEleven he
 * rates lowest, and the best of the rest who plays that position as one of his. Null for a squad
 * without a full eleven.
 */
export function weakestSpot(state: GameState, clubId: string, formation: Formation, read: Read): WeakSpot | null {
  const eleven = assistantEleven(state, clubId, formation, read);
  const spot = eleven.reduce<ReadStarter | null>((weakest, starter) => (!weakest || starter.read < weakest.read ? starter : weakest), null);
  if (!spot) return null;
  const starters = new Set(eleven.map((p) => p.playerId));
  const backup = Object.values(state.players)
    .filter((p) => p.clubId === clubId && !starters.has(p.id) && !isInjured(p, state.date) && positionFit(p, spot.role) >= SECONDARY_POSITION)
    .map(rated(read))
    .sort((a, b) => b.read - a.read || a.playerId.localeCompare(b.playerId))[0];
  return { ...spot, backup: backup ?? null };
}
