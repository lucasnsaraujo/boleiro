import { isCurrentOf } from "../currentCompetitions.js";
import type { GameState } from "../gameState.js";
import { standings } from "../standings.js";

/**
 * Each club's current league first-phase table, best first, keyed by every club in it. Pass
 * `competitionIds` to rank only those leagues.
 */
export function firstPhaseTables(state: Pick<GameState, "competitions" | "fixtures" | "season">, competitionIds?: ReadonlySet<string>): Map<string, string[]> {
  const tables = new Map<string, string[]>();
  const isCurrent = isCurrentOf(state);
  for (const competition of Object.values(state.competitions)) {
    if (competition.kind !== "league" || !isCurrent(competition)) continue;
    if (competitionIds && !competitionIds.has(competition.id)) continue;
    const stage = competition.stages[0];
    if (stage?.kind !== "groups") continue;
    const fixtures = state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === 0);
    for (const group of stage.groups) {
      const table = standings(group, fixtures, competition.drawOrder).map((row) => row.clubId);
      for (const clubId of group) tables.set(clubId, table);
    }
  }
  return tables;
}
