import type { GameState, SimPlayer } from "../gameState.js";

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

const built = new WeakMap<GameState["players"], ReadonlyMap<string, readonly SimPlayer[]>>();

/**
 * The game's squads (squadsByClub), built once per players map and shared by every reader: a game
 * changes its players by making a new map, so a map a game holds is never edited. A draft's map is
 * edited in place (openDraft), so a draft's squads come from squadsByClub instead.
 */
export function squadsOfGame(state: Pick<GameState, "players">): ReadonlyMap<string, readonly SimPlayer[]> {
  let squads = built.get(state.players);
  if (!squads) built.set(state.players, (squads = squadsByClub(state.players)));
  return squads;
}
