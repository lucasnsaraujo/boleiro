import type { DataPack } from "@boleiro/data/dataPack";
import type { GameState, SimPlayer } from "../gameState.js";
import { squadsByClub } from "./squadsByClub.js";
import { openingLineups } from "./usualLineups.js";

/**
 * A game saved before players had positions, brought up to date from the shipped pack: each player
 * the game took from the pack (id `p<row>`, still named as that row) gets the row's positions, and
 * every club the usual lineup a new game would give it. A game that has usual lineups is returned
 * as it is.
 */
export function withPackPositions(state: GameState, pack: Pick<DataPack, "players" | "positions" | "lineups">): GameState {
  if (state.usualLineups) return state;
  const idOfRow = (row: number): string | undefined => {
    const id = `p${row}`;
    return state.players[id] && state.players[id].name === pack.players[row]?.name ? id : undefined;
  };
  const players: Record<string, SimPlayer> = {};
  for (const id in state.players) {
    const player = state.players[id];
    if (!player) continue;
    const row = /^p(\d+)$/.exec(id)?.[1];
    const roles = row === undefined || player.positions || idOfRow(Number(row)) !== id ? undefined : pack.positions[Number(row)];
    players[id] = roles?.length ? { ...player, positions: [...roles] } : player;
  }
  const usualLineups = openingLineups(Object.keys(state.clubs), squadsByClub(players), pack.lineups, idOfRow);
  return { ...state, players, usualLineups };
}
