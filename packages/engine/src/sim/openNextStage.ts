import type { State } from "@boleiro/data/clubs";
import { CONMEBOL_CUPS, type SeasonSoFar } from "./continental/conmebolCups.js";
import { COPA_DO_BRASIL } from "./copaDoBrasil.js";
import type { Competition, Fixture } from "./gameState.js";
import { LEAGUE_FORMATS, type StageShape } from "./leagueFormats.js";
import { stageFixtures } from "./stageFixtures.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";

function nextStageShape(competition: Competition, fixtures: readonly Fixture[], clubStates: Record<string, State>, season: SeasonSoFar): StageShape {
  switch (competition.kind) {
    case "league":
      return LEAGUE_FORMATS[competition.format].nextStage(competition, fixtures, clubStates);
    case "state":
      return STATE_CHAMPIONSHIP.nextStage(competition, fixtures);
    case "cup":
      return COPA_DO_BRASIL.nextStage(competition, fixtures);
    case "continental":
      return CONMEBOL_CUPS.nextStage(competition, season);
  }
}

/** Whether the competition's next stage can be drawn once its current one is played: a continental cup's may wait for another cup's final. */
export const isNextStageReady = (competition: Competition, season: SeasonSoFar): boolean => competition.kind !== "continental" || CONMEBOL_CUPS.isNextStageReady(competition, season);

/**
 * The competition with its next stage drawn, and that stage's fixtures. `fixtures` are its own;
 * `season` is everything played so far, which a continental cup's draw may read from another cup.
 */
export function openNextStage<C extends Competition>(
  competition: C,
  fixtures: readonly Fixture[],
  clubStates: Record<string, State>,
  season: SeasonSoFar = { competitions: {}, fixtures },
): { competition: C; fixtures: Fixture[] } {
  const index = competition.stages.length;
  const dates = competition.stageDates[index];
  if (!dates) throw new Error(`${competition.id}: no stage ${index}`);
  const stage = { ...nextStageShape(competition, fixtures, clubStates, season), dates };
  return { competition: { ...competition, stages: [...competition.stages, stage] }, fixtures: stageFixtures(competition.id, index, stage) };
}
