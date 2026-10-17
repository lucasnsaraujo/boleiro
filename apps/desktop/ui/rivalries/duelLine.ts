import type { CoachDuel } from "@boleiro/game-client/matchPage/matchPageOf";

/** The coaches' record on the match page: "Duelo de técnicos: Ana 3 × 1 Abel Ferreira em 5 jogos". */
export function duelLine(duel: CoachDuel): string {
  const games = duel.meetings === 1 ? "1 jogo" : `${duel.meetings} jogos`;
  const draws = duel.draws ? `, ${duel.draws} ${duel.draws === 1 ? "empate" : "empates"}` : "";
  return `Duelo de técnicos: ${duel.home} ${duel.homeWins} × ${duel.awayWins} ${duel.away} em ${games}${draws}`;
}
