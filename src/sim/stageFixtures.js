import { roundRobin } from "./roundRobin.js";
const BYE = "";
export function stageFixtures(competitionId, stageIndex, stage) {
    const base = { competitionId, stage: stageIndex, result: null };
    const id = (...parts) => [competitionId, stageIndex, ...parts].join(":");
    if (stage.kind === "groups") {
        return stage.groups.flatMap((group, groupIndex) => roundRobin(group.length % 2 ? [...group, BYE] : group, stage.legs).flatMap((pairs, round) => pairs.filter((pair) => !pair.includes(BYE)).map(([homeId, awayId], match) => ({
            ...base,
            id: id(groupIndex, round, match),
            date: stage.dates[round] ?? "",
            homeId,
            awayId,
            group: groupIndex,
        }))));
    }
    return stage.ties.flatMap(([higherSeed, lowerSeed], tie) => stage.dates.map((date, leg) => {
        const hostsLeg = stage.dates.length === 1 || leg === stage.dates.length - 1;
        return { ...base, id: id(tie, leg), date, homeId: hostsLeg ? higherSeed : lowerSeed, awayId: hostsLeg ? lowerSeed : higherSeed, tie };
    }));
}
