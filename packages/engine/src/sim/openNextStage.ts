import type { State } from "@boleiro/data/clubs";
import { COPA_DO_BRASIL } from "./copaDoBrasil.js";
import type { Competition, Fixture } from "./gameState.js";
import { LEAGUE_FORMATS, type StageShape } from "./leagueFormats.js";
import { stageFixtures } from "./stageFixtures.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";

function nextStageShape(competition: Competition, fixtures: readonly Fixture[], clubStates: Record<string, State>): StageShape {
  switch (competition.kind) {
    case "league":
      return LEAGUE_FORMATS[competition.format].nextStage(competition, fixtures, clubStates);
    case "state":
      return STATE_CHAMPIONSHIP.nextStage(competition, fixtures);
    case "cup":
      return COPA_DO_BRASIL.nextStage(competition, fixtures);
  }
}

export function openNextStage<C extends Competition>(
  competition: C,
  fixtures: readonly Fixture[],
  clubStates: Record<string, State>,
): { competition: C; fixtures: Fixture[] } {
  const index = competition.stages.length;
  const dates = competition.stageDates[index];
  if (!dates) throw new Error(`${competition.id}: no stage ${index}`);
  const stage = { ...nextStageShape(competition, fixtures, clubStates), dates };
  return { competition: { ...competition, stages: [...competition.stages, stage] }, fixtures: stageFixtures(competition.id, index, stage) };
}
