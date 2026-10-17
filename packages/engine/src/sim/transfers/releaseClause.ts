import { keyedStream } from "../../engine/random.js";
import type { SimPlayer, Tier } from "../gameState.js";
import { valueOnFullContract } from "./valuePlayer.js";

// Lei 14.597/2023 (Lei Geral do Esporte) art. 86 §1 I: the cláusula indenizatória esportiva is agreed freely,
// up to 2,000 times the average contract wage (image rights apart) for a move inside Brazil; abroad it has no cap.
// guess: a club writes 3 to 8 times his value when he signs, fixed per player, and the cap binds the low-paid.
// Bahia's Ruan Pablo sat at the cap on a first contract, R$ 41.35 mi (https://www.goal.com/br/listas/nova-joia-bahia-multa-rescisoria-41-milhoes-futebol-brasileiro/blt57666c26397e9426),
// while São Paulo's Arboleda had about R$ 300 mi for a Brazilian club (https://tribunadejundiai.com.br/mais/esportes/caso-arboleda-multa-do-jogador-e-de-r-300-milhoes/).
const CLAUSE_WAGES = 2000;
const MIN_TIMES_VALUE = 3;
const MAX_TIMES_VALUE = 8;

/**
 * What another Brazilian club pays, in BRL, to take him without his club's say: the board can't refuse it, only he can.
 * His multiple of his value comes from his id, not from the game's draws, so it is the same in every save.
 */
export function releaseClauseOf(player: Pick<SimPlayer, "id" | "wage" | "strength" | "age">, tier: Tier, eurBrl: number): number {
  const timesValue = MIN_TIMES_VALUE + (MAX_TIMES_VALUE - MIN_TIMES_VALUE) * keyedStream(0, player.id)();
  return Math.min(CLAUSE_WAGES * player.wage, Math.round(timesValue * valueOnFullContract(player, tier) * eurBrl));
}
