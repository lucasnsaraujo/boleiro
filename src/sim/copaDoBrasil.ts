import type { CupCompetition, Fixture } from "./gameState.js";
import type { StageShape } from "./leagueFormats.js";
import { knockoutStageAt } from "./stageAt.js";
import { tieResults } from "./tieResults.js";

// Copa do Brasil 2026: 126 clubs in nine stages. The 28 lowest-ranked clubs play phase 1; 74 more
// join in phase 2; the Série C, Série D, Copa do Nordeste and Copa Verde champions join in phase 3;
// the 20 Série A clubs join the 12 survivors in phase 5 (Super Rádio Tupi,
// https://www.tupi.fm/esportes/nova-era-copa-do-brasil-muda-formato-e-bate-recorde-em-2026/; Lance,
// https://www.lance.com.br/futebol-nacional/copa-do-brasil-2026-confira-classificados-formato-e-quando-estreiam-os-times.html).
// Phases 1–4 and the final are one match, phase 5 to the semi-finals two; a level tie goes straight to
// penalties, with no away-goals rule (O Imparcial,
// https://oimparcial.com.br/noticias/2026/02/copa-do-brasil-comeca-com-126-clubes-e-155-jogos-na-maior-edicao-da-historia/).
export const COPA_DO_BRASIL_ENTRY_STAGES = { phase1: 0, phase2: 1, phase3: 2, serieA: 4 } as const;
export const COPA_DO_BRASIL_ENTRANTS = { phase1: 28, phase2: 74, phase3: 4, serieA: 20 } as const;
const STAGE_COUNT = 9;
const LAST_SINGLE_LEG_PHASE = 3;
// guess: the draw pairs the better-ranked half of a stage against the other half up to phase 5, as the
// real pots do, and is open from the round of 16.
const LAST_POTTED_STAGE = 4;

/** Higher-ranked half against the lower-ranked half, each half in draw order. */
function pottedTies(competition: CupCompetition, clubIds: readonly string[], index: number): [string, string][] {
  const rank = (id: string) => competition.clubIds.indexOf(id);
  const ranked = [...clubIds].sort((a, b) => rank(a) - rank(b));
  const inDrawOrder = (ids: string[]) => ids.sort((a, b) => competition.drawOrder.indexOf(a) - competition.drawOrder.indexOf(b));
  const top = inDrawOrder(ranked.slice(0, ranked.length / 2));
  const bottom = inDrawOrder(ranked.slice(ranked.length / 2));
  // guess: the lower-ranked club hosts single matches, as in earlier Copa do Brasil editions; it is
  // listed first because the first club of a tie hosts the last (here the only) leg.
  return top.map((id, i): [string, string] => (index <= LAST_SINGLE_LEG_PHASE ? [bottom[i] ?? "", id] : [id, bottom[i] ?? ""]));
}

function openTies(competition: CupCompetition, clubIds: readonly string[]): [string, string][] {
  const drawn = [...clubIds].sort((a, b) => competition.drawOrder.indexOf(a) - competition.drawOrder.indexOf(b));
  return Array.from({ length: drawn.length / 2 }, (_, i): [string, string] => [drawn[2 * i] ?? "", drawn[2 * i + 1] ?? ""]);
}

function winnersOf(competition: CupCompetition, fixtures: readonly Fixture[], index: number) {
  return tieResults(knockoutStageAt(competition, index), fixtures.filter((f) => f.stage === index));
}

export const COPA_DO_BRASIL = {
  stageCount: STAGE_COUNT,

  nextStage(competition: CupCompetition, fixtures: readonly Fixture[]): StageShape {
    const index = competition.stages.length;
    const survivors = index === 0 ? [] : winnersOf(competition, fixtures, index - 1).map((r) => r.winnerId);
    const field = [...survivors, ...(competition.entries[index] ?? [])];
    const ties = index <= LAST_POTTED_STAGE ? pottedTies(competition, field, index) : openTies(competition, field);
    return { kind: "knockout", ties };
  },

  /** Winner and runner-up once the final is played. */
  finalists(competition: CupCompetition, fixtures: readonly Fixture[]): { championId: string; runnerUpId: string } | null {
    if (competition.stages.length < STAGE_COUNT) return null;
    const finalFixtures = fixtures.filter((f) => f.stage === STAGE_COUNT - 1);
    if (finalFixtures.some((f) => !f.result)) return null;
    const [final] = winnersOf(competition, finalFixtures, STAGE_COUNT - 1);
    return final ? { championId: final.winnerId, runnerUpId: final.loserId } : null;
  },
};
