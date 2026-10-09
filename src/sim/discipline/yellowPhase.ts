import type { Competition } from "../gameState.js";

/**
 * Yellows count toward a ban only within one phase of a competition; a later phase starts from zero.
 * - Brasileirão: one phase. RGC CBF art. 97 suspends a player for every series of three yellows
 *   in the competition (Diário do Pará, https://diariodopara.com.br/bola/artilheiro-do-remo-nao-vai-enfrentar-o-coritiba-no-sabado/).
 *   guess: Série C and D carry yellows into their later stages too.
 * - Copa do Brasil: yellows are cleared once, after the early rounds, and carry from there to the
 *   final (Lance, 2022: "zerados apenas ao término da segunda fase", the round before the Série A clubs
 *   joined; https://www.lance.com.br/flamengo/flamengo-tera-cartoes-zerados-para-a-final-saiba-o-que-diz-o-regulamento-da-copa-do-brasil.html).
 *   The 2026 format brings Série A in later, so the game clears them when the Série A clubs join.
 * - Estaduais: state federations differ. guess: one rule for all, three yellows per ban and a clean
 *   slate at the knockout stage.
 */
export function yellowPhase(competition: Competition, stage: number): number {
  if (competition.kind === "league") return 0;
  if (competition.kind === "cup") return stage >= competition.entries.findLastIndex((entries) => entries.length > 0) ? 1 : 0;
  return competition.stages[stage]?.kind === "knockout" ? 1 : 0;
}
