import type { ContinentalCompetition, Fixture, IsoDate } from "../gameState.js";
import type { StageShape } from "../leagueFormats.js";
import { knockoutStageAt } from "../stageAt.js";
import { tieResults } from "../tieResults.js";

// FIFA's annual format since 2024 (Wikipedia, "2024 FIFA Intercontinental Cup" and "2025 FIFA
// Intercontinental Cup"): the six confederations' champions in single matches, level ones settled by
// extra time and then penalties (the game's matches have no extra time yet, so a level one goes
// straight to penalties, as in its other cups). The OFC's champion meets the AFC's or CAF's, in turn, in the
// African–Asian–Pacific Cup play-off; its winner the other one in the African–Asian–Pacific Cup;
// the Libertadores' and the CONCACAF Champions Cup's winners meet in the Derby of the Americas; the
// two winners in the Challenger Cup; its winner the Champions League's in the final. FIFA played the
// first two in September and October, the last three in mid-December in Qatar. guess: the first two
// on the Libertadores' quarter-final and semi-final first legs, Tuesdays every calendar and format
// already keeps clear, the last three on the 2025 edition's weekdays after the Brazilian season.
export const INTERCONTINENTAL_CUP_STAGES: { name: string; dates: IsoDate[] }[] = [
  { name: "play-off", dates: ["2026-09-15"] },
  { name: "african-asian-pacific-cup", dates: ["2026-10-13"] },
  { name: "derby-of-the-americas", dates: ["2026-12-09"] },
  { name: "challenger-cup", dates: ["2026-12-12"] },
  { name: "final", dates: ["2026-12-16"] },
];

const STAGES = { playOff: 0, africanAsianPacificCup: 1, derbyOfTheAmericas: 2, challengerCup: 3, final: 4 } as const;

/** Whether FIFA lists the Libertadores' winner first in the season's Derby of the Americas: in even years, CONCACAF's club in odd ones (Botafogo–Pachuca in 2024, Cruz Azul–Flamengo in 2025). */
export const isLibertadoresFirstInDerby = (season: number): boolean => season % 2 === 0;

/** The stage the season's Libertadores winner joins at. */
export const DERBY_OF_THE_AMERICAS = STAGES.derbyOfTheAmericas;

// The 2024 prize money in USD by final place (Sport, as Calcio e Finanza reported it on 19 Dec 2024):
// 5 million for the champion, 4 for the runner-up, then 2.5, 2, 1.5 and 1 million for the losers of the
// Challenger Cup, the Derby of the Americas, the African–Asian–Pacific Cup and its play-off.
const PRIZES_USD: Record<string, number> = {
  "knocked-out:play-off": 1_000_000,
  "knocked-out:african-asian-pacific-cup": 1_500_000,
  "knocked-out:derby-of-the-americas": 2_000_000,
  "knocked-out:challenger-cup": 2_500_000,
  "runner-up": 4_000_000,
  champion: 5_000_000,
};

/** What the Intercontinental Cup pays in USD, by the stage a club goes out at ("knocked-out:<stage>") and for the final, by place: no prize adds to another. */
export const intercontinentalCupPrizes = (): Record<string, number> => PRIZES_USD;

/** The champions the Intercontinental Cup's later draws take from other cups: the season's Libertadores winner and the latest Champions League one. */
export type LaterEntrants = { libertadores: string | null; championsLeague: string | null };

const winnerOf = (competition: ContinentalCompetition, fixtures: readonly Fixture[], stage: number) =>
  tieResults(knockoutStageAt(competition, stage), fixtures.filter((f) => f.competitionId === competition.id && f.stage === stage))[0]?.winnerId ?? "";

/**
 * The Intercontinental Cup's next tie. guess: the game has no neutral grounds, so the first club of a
 * tie hosts it: the play-off's AFC or CAF club, the African–Asian–Pacific Cup's club with the bye (as
 * both editions), the Derby's South American club in even years and North American in odd (as FIFA
 * listed them), the Challenger Cup's Derby winner and the final's European club.
 */
export function intercontinentalCupStage(competition: ContinentalCompetition, fixtures: readonly Fixture[], later: LaterEntrants): StageShape {
  const index = competition.stages.length;
  const entrant = (stage: number) => competition.entries[stage]?.[0] ?? "";
  const tie = (home: string, away: string): StageShape => ({ kind: "knockout", ties: [[home, away]] });
  switch (index) {
    case STAGES.playOff:
      return tie(entrant(STAGES.playOff), competition.entries[STAGES.playOff]?.[1] ?? "");
    case STAGES.africanAsianPacificCup:
      return tie(entrant(STAGES.africanAsianPacificCup), winnerOf(competition, fixtures, STAGES.playOff));
    case STAGES.derbyOfTheAmericas: {
      const southAmerican = later.libertadores ?? "";
      const northAmerican = entrant(STAGES.derbyOfTheAmericas);
      return isLibertadoresFirstInDerby(competition.season) ? tie(southAmerican, northAmerican) : tie(northAmerican, southAmerican);
    }
    case STAGES.challengerCup:
      return tie(winnerOf(competition, fixtures, STAGES.derbyOfTheAmericas), winnerOf(competition, fixtures, STAGES.africanAsianPacificCup));
    default:
      return tie(later.championsLeague ?? "", winnerOf(competition, fixtures, STAGES.challengerCup));
  }
}

/** Whether the Intercontinental Cup's next stage can be drawn: the Derby of the Americas waits for the Libertadores' winner. */
export const isIntercontinentalStageReady = (competition: ContinentalCompetition, later: LaterEntrants): boolean =>
  competition.stages.length !== STAGES.derbyOfTheAmericas || later.libertadores !== null;
