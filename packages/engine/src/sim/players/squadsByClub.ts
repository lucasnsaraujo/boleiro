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
 * edited in place (openDraft), so whatever edits one calls forgetSquads first.
 */
export function squadsOfGame(state: Pick<GameState, "players">): ReadonlyMap<string, readonly SimPlayer[]> {
  let squads = built.get(state.players);
  if (!squads) built.set(state.players, (squads = squadsByClub(state.players)));
  return squads;
}

/** Lets a fresh copy of a players map (openDraft's) share the squads built for the map it copies. */
export function shareSquads(players: GameState["players"], copy: GameState["players"]): void {
  const squads = built.get(players);
  if (squads) built.set(copy, squads);
}

/** Drops the squads built for a players map about to be edited in place (a draft's, see openDraft). */
export function forgetSquads(players: GameState["players"]): void {
  built.delete(players);
}
