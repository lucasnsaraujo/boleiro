import { CONMEBOL_CUPS } from "../continental/conmebolCups.js";
import { COPA_DO_BRASIL } from "../copaDoBrasil.js";
import type { Competition, Fixture } from "../gameState.js";
import { LEAGUE_FORMATS } from "../leagueFormats.js";
import { STATE_CHAMPIONSHIP } from "../stateChampionship.js";

/** The winner of a competition once its last stage is played, else null. */
export function championOf(competition: Competition, fixtures: readonly Fixture[]): string | null {
  if (competition.stages.length < competition.stageDates.length || fixtures.some((f) => !f.result)) return null;
  switch (competition.kind) {
    case "league":
      return LEAGUE_FORMATS[competition.format].outcome(competition, fixtures).championId || null;
    case "state":
      return STATE_CHAMPIONSHIP.placings(competition, fixtures)[0] ?? null;
    case "cup":
      return COPA_DO_BRASIL.finalists(competition, fixtures)?.championId ?? null;
    case "continental":
      return CONMEBOL_CUPS.finalists(competition, fixtures)?.championId ?? null;
    case "cupAbroad":
      // Its champion is the result-only cup's: the full tier plays only one club's matches.
      return null;
  }
}
