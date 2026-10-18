import { CUP_STAGES } from "./continental/conmebolCups.js";
import type { Competition } from "./gameState.js";

/**
 * How a knockout tie still level when its last leg's ninety minutes end is settled: thirty minutes
 * of extra time and then penalties, straight to penalties, or the better seed (listed first) going through.
 */
export type TieBreak = "extraTime" | "penalties" | "betterSeed";

// The real rules:
// - Intercontinental Cup: extra time and penalties in every match (Wikipedia, "2025 FIFA Intercontinental
//   Cup", Format: https://en.wikipedia.org/wiki/2025_FIFA_Intercontinental_Cup).
// - Club World Cup: extra time and penalties in the knockout stage (Wikipedia, "2025 FIFA Club World Cup",
//   Format: https://en.wikipedia.org/wiki/2025_FIFA_Club_World_Cup).
// - Libertadores and Sul-Americana: no extra time in two-legged ties, straight to penalties; the one-match
//   final plays extra time (El Gráfico, "Guía rápida: las claves del reglamento de la CONMEBOL Libertadores
//   2026", https://elgrafico.com.ar/articulo/conmebol-libertadores/98629/guia-rapida-las-claves-del-reglamento-de-la-conmebol-libertadores-2026).
//   guess: the Sul-Americana's one-match first stage goes straight to penalties, as every other round before the final.
// - Recopa: extra time when level on aggregate (Wikipedia, "2026 Recopa Sudamericana", Format:
//   https://en.wikipedia.org/wiki/2026_Recopa_Sudamericana).
// - Copa do Brasil 2026: no extra time in any phase; phases 1 to 4 and the one-match final go straight to penalties,
//   the two-legged ties to penalties after goal difference (CBF, Regulamento Específico da Copa do Brasil 2026,
//   art. 22, https://stcbfsiteprdimgbrs.blob.core.windows.net/img-site/cdn/REC_Copa_do_Brasil_2026_66989a5426.pdf).
// - State championships: guess, penalties, as the Paulista's 2026 knockout rounds (Wikipedia, "2026 Campeonato
//   Paulista", https://en.wikipedia.org/wiki/2026_Campeonato_Paulista); the game's estaduais share one format.
// - MLS: straight to penalties in the best-of-three round one (the game's first play-off round), extra time
//   from the conference semi-finals (Wikipedia, "2025 MLS Cup playoffs", https://en.wikipedia.org/wiki/2025_MLS_Cup_playoffs).
// - Liga MX: a liguilla quarter- or semi-final level on aggregate sends the better-placed club through; the
//   final plays extra time and penalties (Fox Sports México, https://www.foxsports.com.mx/2023/12/02/que-pasa-si-hay-empate-en-la-liguilla-de-la-liga-mx/).
// - Série C and D: guess, penalties, as Brazil's other two-legged ties.
// A round the game's formats play as one match where the real one has two legs follows the competition's final.
const MLS_FIRST_ROUND = 1;
const LIGA_MX_FINALS = new Set([3, 7]);

const isMadeOneMatch = (competition: Competition, stage: number, realLegs: number | undefined) => realLegs === 2 && competition.stageDates[stage]?.length === 1;

/** How the competition settles a tie still level after its last leg's ninety minutes at `stage`. */
export function tieBreakOf(competition: Competition, stage: number): TieBreak {
  const isFinal = stage === competition.stageDates.length - 1;
  switch (competition.kind) {
    case "continental": {
      const { cup } = competition;
      if (cup === "intercontinental-cup" || cup === "club-world-cup" || cup === "recopa") return "extraTime";
      return isFinal || isMadeOneMatch(competition, stage, CUP_STAGES[cup][stage]?.dates.length) ? "extraTime" : "penalties";
    }
    case "cup":
      return "penalties";
    case "league":
      if (competition.format === "mls") return stage > MLS_FIRST_ROUND ? "extraTime" : "penalties";
      if (competition.format === "liga-mx") return LIGA_MX_FINALS.has(stage) ? "extraTime" : "betterSeed";
      return "penalties";
    case "state":
      return "penalties";
    case "cupAbroad":
      return competition.tieBreaks[stage] ?? "extraTime";
    case "national":
      // A national knockout round level after ninety minutes plays extra time and then penalties, as the result-only draw does.
      return "extraTime";
  }
}

/** Whether leg `leg` (0 the first) of a tie at `stage` goes to extra time when the tie is level after its ninety minutes. */
export function hasExtraTime(competition: Competition, stage: number, leg: number): boolean {
  const legs = competition.stageDates[stage]?.length ?? 1;
  return leg === legs - 1 && tieBreakOf(competition, stage) === "extraTime";
}

// National cups abroad, result-only and one match a round:
// - England, Spain, Germany: extra time in every round (Wikipedia, "FA Cup": replays scrapped from 2024–25,
//   ties settled on the day by extra time and penalties, https://en.wikipedia.org/wiki/FA_Cup; "2025–26 Copa del
//   Rey", https://en.wikipedia.org/wiki/2025%E2%80%9326_Copa_del_Rey; "2025–26 DFB-Pokal",
//   https://en.wikipedia.org/wiki/2025%E2%80%9326_DFB-Pokal).
// - Italy: straight to penalties up to the quarter-finals, extra time in the semi-finals and the final
//   (Calcio e Finanza, https://www.calcioefinanza.it/?p=154091).
// - France: straight to penalties up to the semi-finals, extra time in the final (Ligue de football des Pays de
//   la Loire, Coupe de France 2025–26 rules, https://lfpl.fff.fr/wp-content/uploads/sites/20/2025/06/REGLEMENT-DE-LA-COUPE-DE-FRANCE-2025-2026.pdf).
// - Belgium: straight to penalties in the first three of eleven rounds, extra time from the fourth (Wikipedia,
//   "2025–26 Belgian Cup", https://en.wikipedia.org/wiki/2025%E2%80%9326_Belgian_Cup); the game's shorter cup
//   counts its rounds back from the final.
// - Greece: extra time abolished up to the semi-finals, read as played in the final only (Wikipedia,
//   "2025–26 Greek Football Cup", https://en.wikipedia.org/wiki/2025%E2%80%9326_Greek_Football_Cup).
// - Ukraine and Slovakia: no extra time, straight to penalties in every round (Wikipedia, "2025–26 Ukrainian Cup",
//   https://en.wikipedia.org/wiki/2025%E2%80%9326_Ukrainian_Cup; "2025–26 Slovak Cup", Format:
//   https://en.wikipedia.org/wiki/2025%E2%80%9326_Slovak_Cup).
// - Scotland, Turkey, Croatia, Norway, Slovenia, Israel: extra time in every round (Wikipedia, "Scottish Cup",
//   https://en.wikipedia.org/wiki/Scottish_Cup; Turkish Wikipedia, "2025-26 Türkiye Kupası", https://tr.wikipedia.org/wiki/2025-26_T%C3%BCrkiye_Kupas%C4%B1;
//   "Croatian Football Cup", https://en.wikipedia.org/wiki/Croatian_Football_Cup; "Norwegian Football Cup",
//   https://en.wikipedia.org/wiki/Norwegian_Football_Cup; "Slovenian Football Cup", https://en.wikipedia.org/wiki/Slovenian_Football_Cup;
//   "Israel State Cup", https://en.wikipedia.org/wiki/Israel_State_Cup).
// - Portugal, the Netherlands, Austria, Poland, Czechia, Hungary, Bulgaria, Cyprus, Armenia, Azerbaijan: guess,
//   extra time in every round, as most national cups play it (Portugal's 2026 final went to it).
// The game's South American countries play no national cup.
const ROUNDS_WITH_EXTRA_TIME_FROM_FINAL: Record<string, number> = { it: 2, fr: 1, be: 8, gr: 1, ua: 0, sk: 0 };

/** Whether round `round` (0 the first) of a result-only national cup of `rounds` rounds in `country` plays extra time. */
export function hasNationalCupExtraTime(country: string, round: number, rounds: number): boolean {
  const lastRounds = ROUNDS_WITH_EXTRA_TIME_FROM_FINAL[country];
  return lastRounds === undefined || rounds - round <= lastRounds;
}
