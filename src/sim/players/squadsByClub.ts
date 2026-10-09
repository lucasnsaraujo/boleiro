import type { SimPlayer } from "../gameState.js";

/** Each club's players, in the players map's order. A for-in walk: Object.values would copy thousands of players first. */
export function squadsByClub(players: Readonly<Record<string, SimPlayer>>): Map<string, SimPlayer[]> {
  const squads = new Map<string, SimPlayer[]>();
  for (const id in players) {
    const player = players[id];
    if (!player) continue;
    const squad = squads.get(player.clubId);
    if (squad) squad.push(player);
    else squads.set(player.clubId, [player]);
  }
  return squads;
}
