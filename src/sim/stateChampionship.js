import { seededTies } from "./seededTies.js";
import { groupStageAt, knockoutStageAt } from "./stageAt.js";
import { standings } from "./standings.js";
import { tieResults } from "./tieResults.js";
// One format for every state, as the spec (#2) settles: groups, then knockout. Real estaduais differ
// state by state; this one is a simplification that fits each state's 7 to 21 clubs into the 11
// reserved dates.
// guess: groups of at most six playing one round each (five dates), the size most estaduais use.
const MAX_GROUP_SIZE = 6;
const GROUP_DATES = 5;
// guess: states with 12 or more clubs send eight to the knockout, smaller ones four; every
// knockout round is two legs, the usual estadual final.
const knockoutSize = (clubCount) => (clubCount >= 12 ? 8 : 4);
const LEGS = 2;
/** Every club ranked by group position, then by its record against the whole field. */
function groupRanking(competition, fixtures) {
    const groupFixtures = fixtures.filter((f) => f.stage === 0);
    const overall = standings(competition.clubIds, groupFixtures, competition.drawOrder).map((row) => row.clubId);
    return groupStageAt(competition, 0)
        .groups.flatMap((group) => standings(group, groupFixtures, competition.drawOrder).map((row, position) => ({ id: row.clubId, position })))
        .sort((a, b) => a.position - b.position || overall.indexOf(a.id) - overall.indexOf(b.id))
        .map(({ id }) => id);
}
function snakeGroups(clubIds) {
    const count = Math.max(2, Math.ceil(clubIds.length / MAX_GROUP_SIZE));
    const groups = Array.from({ length: count }, () => []);
    clubIds.forEach((id, i) => {
        const lap = Math.floor(i / count);
        groups[lap % 2 ? count - 1 - (i % count) : i % count]?.push(id);
    });
    return groups;
}
export const STATE_CHAMPIONSHIP = {
    stageDates(clubCount, dates) {
        const rounds = Math.log2(knockoutSize(clubCount));
        const knockout = dates.slice(-LEGS * rounds);
        return [dates.slice(0, GROUP_DATES), ...Array.from({ length: rounds }, (_, r) => knockout.slice(LEGS * r, LEGS * (r + 1)))];
    },
    /** Clubs playing each stage: everyone in the groups, then the knockout halving to the final. */
    stageSizes(clubCount) {
        const rounds = Math.log2(knockoutSize(clubCount));
        return [clubCount, ...Array.from({ length: rounds }, (_, r) => knockoutSize(clubCount) / 2 ** r)];
    },
    nextStage(competition, fixtures) {
        const index = competition.stages.length;
        if (index === 0)
            return { kind: "groups", groups: snakeGroups(competition.clubIds), legs: 1 };
        const seeds = groupRanking(competition, fixtures).slice(0, knockoutSize(competition.clubIds.length));
        if (index === 1)
            return { kind: "knockout", ties: seededTies(seeds) };
        const previous = tieResults(knockoutStageAt(competition, index - 1), fixtures.filter((f) => f.stage === index - 1));
        return { kind: "knockout", ties: seededTies(previous.map((r) => r.winnerId).sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b))) };
    },
    /** Final placings, champion first: knockout losers by round reached and seed, then the rest by group record. */
    placings(competition, fixtures) {
        const ranking = groupRanking(competition, fixtures);
        const byRanking = (ids) => ids.sort((a, b) => ranking.indexOf(a) - ranking.indexOf(b));
        const placed = [];
        for (let index = competition.stages.length - 1; index >= 1; index--) {
            const results = tieResults(knockoutStageAt(competition, index), fixtures.filter((f) => f.stage === index));
            if (index === competition.stages.length - 1)
                placed.push(...results.map((r) => r.winnerId));
            placed.push(...byRanking(results.map((r) => r.loserId)));
        }
        return [...placed, ...ranking.filter((id) => !placed.includes(id))];
    },
};
