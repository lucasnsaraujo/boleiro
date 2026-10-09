import type { Fixture, Stage } from "./gameState.js";
import { roundRobin } from "./roundRobin.js";

export function stageFixtures(competitionId: string, stageIndex: number, stage: Stage): Fixture[] {
  const base = { competitionId, stage: stageIndex, result: null };
  const id = (...parts: (string | number)[]) => [competitionId, stageIndex, ...parts].join(":");
  if (stage.kind === "groups") {
    return stage.groups.flatMap((group, groupIndex) =>
      roundRobin(group, stage.legs).flatMap((pairs, round) =>
        pairs.map(([homeId, awayId], match): Fixture => ({
          ...base,
          id: id(groupIndex, round, match),
          date: stage.dates[round] ?? "",
          homeId,
          awayId,
          group: groupIndex,
        })),
      ),
    );
  }
  return stage.ties.flatMap(([higherSeed, lowerSeed], tie) =>
    stage.dates.map((date, leg): Fixture => {
      const hostsLeg = stage.dates.length === 1 || leg === stage.dates.length - 1;
      return { ...base, id: id(tie, leg), date, homeId: hostsLeg ? higherSeed : lowerSeed, awayId: hostsLeg ? lowerSeed : higherSeed, tie };
    }),
  );
}
