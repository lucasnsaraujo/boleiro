import type { Role } from "@boleiro/data/players";
import { arrange, FORMATIONS, positionFit, type Formation, type Slot } from "@boleiro/engine/engine/formations";
import type { PositionGroup } from "@boleiro/engine/engine/match";
import type { SquadPlayer } from "@boleiro/game-client/round/matchDayPlan";

/** The letter on a position's disc, as Brazilian squad lists mark it (album.css `.pos`). */
export const ROLE_LETTER: Record<Role, "G" | "L" | "Z" | "M" | "A"> = { goleiro: "G", lateral: "L", zagueiro: "Z", meia: "M", atacante: "A" };
export const ROLE_NAME: Record<Role, string> = { goleiro: "Goleiro", lateral: "Lateral", zagueiro: "Zagueiro", meia: "Meia", atacante: "Atacante" };
const ROLE_PLACE: Record<Role, string> = { goleiro: "no gol", lateral: "na lateral", zagueiro: "na zaga", meia: "no meio", atacante: "no ataque" };
// A player the data gives no positions plays his group; a bare defender counts as a zagueiro, as pipeline/positions.py reads one.
const GROUP_ROLE: Record<PositionGroup, Role> = { GK: "goleiro", DEF: "zagueiro", MID: "meia", ATT: "atacante" };

/** What playing a starter where he stands costs: in one of his other positions, or out of them all. */
export type PositionCost = { kind: "secondary" | "improvised"; text: string };

/** A starter where the formation puts him: his slot, the share of his strength he keeps there and what it costs. */
export type PlacedStarter = { player: SquadPlayer; slot: Slot; fit: number; cost: PositionCost | null };

export function mainRole(player: Pick<SquadPlayer, "group" | "positions">): Role {
  return player.positions?.[0] ?? GROUP_ROLE[player.group];
}

function costOf(player: SquadPlayer, role: Role, fit: number): PositionCost | null {
  if (fit >= 1) return null;
  const percent = `−${Math.round((1 - fit) * 100)}%`;
  const rank = player.positions?.indexOf(role) ?? -1;
  if (rank > 0) return { kind: "secondary", text: `${rank + 1}ª posição, ${ROLE_NAME[role].toLowerCase()} ${percent}` };
  return { kind: "improvised", text: `Improvisado ${ROLE_PLACE[role]} ${percent}` };
}

/** The eleven placed in the formation as the engine places it (arrange), in its slots' order: keeper first, then line by line from the back. */
export function placeStarters(starters: readonly SquadPlayer[], formation: Formation): PlacedStarter[] {
  const slots = FORMATIONS[formation];
  return arrange(starters, formation).flatMap((player, s) => {
    const slot = slots[s];
    if (!player || !slot) return [];
    const fit = positionFit(player, slot.role);
    return [{ player, slot, fit, cost: costOf(player, slot.role, fit) }];
  });
}

/** The strength a starter plays at in his slot. */
export function placedStrength({ player, fit }: PlacedStarter): number {
  return Math.round(player.strength * fit);
}

/** The eleven's average strength where they stand, one decimal. */
export function teamStrength(placed: readonly PlacedStarter[]): number {
  if (!placed.length) return 0;
  return Math.round((placed.reduce((sum, { player, fit }) => sum + player.strength * fit, 0) / placed.length) * 10) / 10;
}

/**
 * Notes for the bench, by player id: for each position a starter is improvised in, the strongest
 * available bench player whose main position it is ("Zagueiro de origem").
 */
export function benchHints(bench: readonly SquadPlayer[], placed: readonly PlacedStarter[]): Map<string, string> {
  const hints = new Map<string, string>();
  const needed = new Set(placed.flatMap((starter) => (starter.cost?.kind === "improvised" ? [starter.slot.role] : [])));
  for (const role of needed) {
    const best = bench.filter((p) => p.status === null && mainRole(p) === role).sort((a, b) => b.strength - a.strength)[0];
    if (best) hints.set(best.id, `${ROLE_NAME[role]} de origem`);
  }
  return hints;
}
