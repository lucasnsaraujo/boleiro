import type { State } from "../data/clubs.js";
import type { Fixture, LeagueCompetition } from "./gameState.js";
import { LEAGUE_FORMATS } from "./leagueFormats.js";
import { stageFixtures } from "./stageFixtures.js";

export function openNextStage(
  competition: LeagueCompetition,
  fixtures: readonly Fixture[],
  clubStates: Record<string, State>,
): { competition: LeagueCompetition; fixtures: Fixture[] } {
  const index = competition.stages.length;
  const dates = competition.stageDates[index];
  if (!dates) throw new Error(`${competition.id}: no stage ${index}`);
  const stage = { ...LEAGUE_FORMATS[competition.format].nextStage(competition, fixtures, clubStates), dates };
  return { competition: { ...competition, stages: [...competition.stages, stage] }, fixtures: stageFixtures(competition.id, index, stage) };
}
