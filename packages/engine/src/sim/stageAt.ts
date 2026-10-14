import type { Competition, GroupStage, KnockoutStage } from "./gameState.js";

export function groupStageAt(competition: Competition, index: number): GroupStage {
  const stage = competition.stages[index];
  if (stage?.kind !== "groups") throw new Error(`${competition.id}: stage ${index} is not a group stage`);
  return stage;
}

export function knockoutStageAt(competition: Competition, index: number): KnockoutStage {
  const stage = competition.stages[index];
  if (stage?.kind !== "knockout") throw new Error(`${competition.id}: stage ${index} is not a knockout stage`);
  return stage;
}
