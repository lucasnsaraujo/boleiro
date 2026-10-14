import type { Fixture, KnockoutStage } from "./gameState.js";

export type TieResult = { winnerId: string; loserId: string };

export function aggregate(clubId: string, fixtures: readonly Fixture[]): number {
  return fixtures.reduce(
    (goals, f) => goals + (f.homeId === clubId ? (f.result?.homeGoals ?? 0) : f.awayId === clubId ? (f.result?.awayGoals ?? 0) : 0),
    0,
  );
}

export function tieResults(stage: KnockoutStage, stageFixtures: readonly Fixture[]): TieResult[] {
  return stage.ties.map(([a, b], tie) => {
    const legs = stageFixtures.filter((f) => f.tie === tie);
    const goalsA = aggregate(a, legs);
    const goalsB = aggregate(b, legs);
    const shootout = legs.find((f) => f.result?.penaltyWinnerId)?.result?.penaltyWinnerId;
    const aWins = goalsA > goalsB || (goalsA === goalsB && shootout === a);
    return aWins ? { winnerId: a, loserId: b } : { winnerId: b, loserId: a };
  });
}
