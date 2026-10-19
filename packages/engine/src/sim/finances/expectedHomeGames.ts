import type { Competition, Fixture } from "../gameState.js";
import { LEAGUE_FORMATS } from "../leagueFormats.js";
import { STATE_CHAMPIONSHIP } from "../stateChampionship.js";
import { TIE_WIN_CHANCE } from "./expectedCopaPrize.js";
import { pow } from "../portableMath.js";

/** Clubs playing each stage of a league or state championship. */
function stageSizes(competition: Competition): number[] {
  const clubCount = competition.clubIds.length;
  if (competition.kind === "league") return LEAGUE_FORMATS[competition.format].stageSizes(clubCount);
  if (competition.kind === "state") return STATE_CHAMPIONSHIP.stageSizes(clubCount);
  return [];
}

/**
 * Home games each club can expect over the season: the fixtures already drawn, plus an expected
 * value for every stage not drawn yet. A club plays half a stage's dates at home, whether the stage
 * is a group or a knockout tie. guess: in leagues and state championships every club is equally
 * likely to reach a later stage (its share of the field that gets there); in the Copa do Brasil a
 * club wins each tie half the time, as expectedCopaPrize assumes, and is sure to play the stage it
 * enters at. On shorter formats each game counts for the real games it stands for (`gameScales`), half at each ground.
 */
export function expectedHomeGames(competitions: readonly Competition[], fixtures: readonly Fixture[]): Map<string, number> {
  const games = new Map<string, number>();
  const add = (clubId: string, count: number) => games.set(clubId, (games.get(clubId) ?? 0) + count);
  const scales = new Map(competitions.map((competition) => [competition.id, competition.gameScales]));
  for (const f of fixtures) {
    const scale = scales.get(f.competitionId)?.[f.stage] ?? 1;
    // A game standing for several real ones counts half of them at each club's ground, as recordMatchFinances books them.
    if (scale === 1) add(f.homeId, 1);
    else for (const id of [f.homeId, f.awayId]) add(id, scale / 2);
  }
  for (const competition of competitions) {
    const sizes = stageSizes(competition);
    competition.stageDates.forEach((dates, stage) => {
      if (stage < competition.stages.length) return;
      const homeGames = (dates.length / 2) * (competition.gameScales?.[stage] ?? 1);
      if (competition.kind === "cup") {
        competition.entries.forEach((entrants, entryStage) => {
          if (entryStage > stage) return;
          const reach = pow(TIE_WIN_CHANCE, stage - entryStage);
          for (const id of entrants) add(id, reach * homeGames);
        });
        return;
      }
      const reach = (sizes[stage] ?? 0) / competition.clubIds.length;
      for (const id of competition.clubIds) add(id, reach * homeGames);
    });
  }
  return games;
}
