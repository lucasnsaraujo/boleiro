import type { Role } from "@boleiro/data/players";
import { FORMATIONS, positionFit, SECONDARY_POSITION, type Formation } from "../../engine/formations.js";
import type { GameState } from "../gameState.js";
import { isInjured } from "../players/isInjured.js";
import { matchClubOf } from "../players/matchSetup.js";
import { pickMatchLineup } from "../players/pickMatchLineup.js";
import { usualStartersOf } from "../players/usualLineups.js";

/** A player as the assistant rates him: his strength as the assistant reads it. */
export type ReadPlayer = { playerId: string; name: string; age: number; read: number };

/** The starter the assistant reads weakest, in the slot he plays, and the best other player of the squad for that position. */
export type WeakSpot = ReadPlayer & { role: Role; backup: ReadPlayer | null };

/**
 * The weakest spot of the club's eleven as the assistant sees it: the day's best eleven in `formation`,
 * each starter rated by `read` (assistantReadOf), the one he rates lowest, and the best of the rest who
 * plays that position as one of his. Null for a squad without a full eleven.
 */
export function weakestSpot(state: GameState, clubId: string, formation: Formation, read: (playerId: string, strength: number) => number): WeakSpot | null {
  const club = matchClubOf(state, clubId);
  if (!club) return null;
  const squad = Object.values(state.players).filter((p) => p.clubId === clubId);
  const eleven = pickMatchLineup(squad, { date: state.date, pitch: club.pitch }, formation, usualStartersOf(state, clubId));
  const slots = FORMATIONS[formation];
  if (eleven.length !== slots.length) return null;
  const rated = (p: (typeof squad)[number]): ReadPlayer => ({ playerId: p.id, name: p.name, age: p.age, read: read(p.id, p.strength) });
  let spot: WeakSpot | null = null;
  for (const [slot, player] of eleven.entries()) {
    const role = slots[slot]?.role;
    const seen = rated(player);
    if (role && (!spot || seen.read < spot.read)) spot = { ...seen, role, backup: null };
  }
  if (!spot) return null;
  const { role } = spot;
  const starters = new Set(eleven.map((p) => p.id));
  const backup = squad
    .filter((p) => !starters.has(p.id) && !isInjured(p, state.date) && positionFit(p, role) >= SECONDARY_POSITION)
    .map(rated)
    .sort((a, b) => b.read - a.read || a.playerId.localeCompare(b.playerId))[0];
  return { ...spot, backup: backup ?? null };
}
