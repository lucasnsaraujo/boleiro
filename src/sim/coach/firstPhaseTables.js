import { standings } from "../standings.js";
/**
 * Each club's current league first-phase table, best first, keyed by every club in it. Pass
 * `competitionIds` to rank only those leagues.
 */
export function firstPhaseTables(state, competitionIds) {
    const tables = new Map();
    for (const competition of Object.values(state.competitions)) {
        if (competition.kind !== "league" || competition.season !== state.season)
            continue;
        if (competitionIds && !competitionIds.has(competition.id))
            continue;
        const stage = competition.stages[0];
        if (stage?.kind !== "groups")
            continue;
        const fixtures = state.fixtures.filter((f) => f.competitionId === competition.id && f.stage === 0);
        for (const group of stage.groups) {
            const table = standings(group, fixtures, competition.drawOrder).map((row) => row.clubId);
            for (const clubId of group)
                tables.set(clubId, table);
        }
    }
    return tables;
}
