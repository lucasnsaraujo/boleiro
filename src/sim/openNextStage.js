import { COPA_DO_BRASIL } from "./copaDoBrasil.js";
import { LEAGUE_FORMATS } from "./leagueFormats.js";
import { stageFixtures } from "./stageFixtures.js";
import { STATE_CHAMPIONSHIP } from "./stateChampionship.js";
function nextStageShape(competition, fixtures, clubStates) {
    switch (competition.kind) {
        case "league":
            return LEAGUE_FORMATS[competition.format].nextStage(competition, fixtures, clubStates);
        case "state":
            return STATE_CHAMPIONSHIP.nextStage(competition, fixtures);
        case "cup":
            return COPA_DO_BRASIL.nextStage(competition, fixtures);
    }
}
export function openNextStage(competition, fixtures, clubStates) {
    const index = competition.stages.length;
    const dates = competition.stageDates[index];
    if (!dates)
        throw new Error(`${competition.id}: no stage ${index}`);
    const stage = { ...nextStageShape(competition, fixtures, clubStates), dates };
    return { competition: { ...competition, stages: [...competition.stages, stage] }, fixtures: stageFixtures(competition.id, index, stage) };
}
