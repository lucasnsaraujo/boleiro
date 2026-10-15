import type { ClubLineup } from "@boleiro/data/dataPack";
import { fittingFormation, isFormation, type Formation } from "../../engine/formations.js";
import type { GameState, SimPlayer, UsualLineup } from "../gameState.js";

/**
 * Every club's usual lineup at the start of a game: its last real match where the data has one (its
 * starters by the ids `idOfRow` gives the data's player rows), in its formation when the game plays
 * it, else in the formation those starters fit best; a club the data has no match for plays the
 * formation its squad fits best (fittingFormation), with no usual starters.
 */
export function openingLineups(
  clubIds: readonly string[],
  squads: ReadonlyMap<string, readonly SimPlayer[]>,
  lineups: readonly ClubLineup[],
  idOfRow: (row: number) => string | undefined,
): Record<string, UsualLineup> {
  const real = new Map(lineups.map((lineup) => [lineup.clubId, lineup]));
  return Object.fromEntries(
    clubIds.map((clubId) => {
      const lineup = real.get(clubId);
      const starters = lineup?.starters.flatMap((row) => (row === null ? [] : (idOfRow(row) ?? []))) ?? [];
      if (lineup && isFormation(lineup.formation)) return [clubId, { formation: lineup.formation, starters }];
      if (starters.length) {
        const eleven = (squads.get(clubId) ?? []).filter((player) => starters.includes(player.id));
        return [clubId, { formation: fittingFormation(eleven), starters }];
      }
      return [clubId, { formation: fittingFormation(squads.get(clubId) ?? []), starters: [] }];
    }),
  );
}

/** The formation the club's AI coach plays: its usual one, else the one its squad fits best. */
export function formationOf(state: Pick<GameState, "usualLineups">, clubId: string, squad: readonly SimPlayer[]): Formation {
  return state.usualLineups?.[clubId]?.formation ?? fittingFormation(squad);
}

export function usualStartersOf(state: Pick<GameState, "usualLineups">, clubId: string): ReadonlySet<string> {
  return new Set(state.usualLineups?.[clubId]?.starters ?? []);
}
