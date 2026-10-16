import { copyRecord } from "../copyRecord.js";
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

const isIndexKey = (id: string) => /^\d+$/.test(id);

/**
 * Moves a player in the squads built for a players map just edited in place (a draft's, see
 * openDraft): `before` has left the map and `after` has been added as its last key. When the move
 * would shift a club's place among the squads (its first player left), the squads are dropped.
 */
export function moveInSquads(players: GameState["players"], before: SimPlayer | undefined, after: SimPlayer | undefined): void {
  const squads = built.get(players);
  if (!squads) return;
  built.delete(players);
  if (after && isIndexKey(after.id)) return;
  const next = new Map(squads);
  if (before) {
    const squad = next.get(before.clubId) ?? [];
    const index = squad.indexOf(before);
    if (index < 0 || (index === 0 && squad.length > 1)) return;
    if (squad.length === 1) next.delete(before.clubId);
    else next.set(before.clubId, squad.filter((p) => p !== before));
  }
  if (after) next.set(after.clubId, [...(next.get(after.clubId) ?? []), after]);
  built.set(players, next);
}

/**
 * A copy of the players map with some players replaced by new versions of themselves at the same
 * club (a match's load, an injury). The copy keeps the squads built for the map, with only the
 * replaced players' squads copied, so a day's few changes don't build every squad again.
 */
export function withReplacedPlayers(players: GameState["players"], replaced: readonly SimPlayer[]): Record<string, SimPlayer> {
  const copy = copyRecord(players);
  const squads = built.get(players);
  const changed = new Map<string, SimPlayer[]>();
  let isKept = squads !== undefined;
  for (const player of replaced) {
    const old = copy[player.id];
    copy[player.id] = player;
    if (!squads || !isKept) continue;
    let squad = changed.get(player.clubId);
    if (!squad) changed.set(player.clubId, (squad = [...(squads.get(player.clubId) ?? [])]));
    const index = old ? squad.indexOf(old) : -1;
    if (index < 0) isKept = false;
    else squad[index] = player;
  }
  if (squads && isKept) built.set(copy, new Map([...squads, ...changed]));
  return copy;
}
