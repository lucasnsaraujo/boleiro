import { addDays } from "@boleiro/engine/sim/dates";
import type { GameState } from "@boleiro/engine/sim/gameState";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { formatDayMonth } from "@boleiro/game-client/format/formatGameDate";
import { refusalText } from "@boleiro/game-client/hub/inboxLines";
import { dueRequests, type BoardAnswer } from "@boleiro/game-client/market/boardDesk";
import { windowStatus } from "./marketSearch.js";

/** The request as a noun, and whether pt-BR treats it as feminine. */
const NOUNS: Record<CoachRequest["kind"], { noun: string; feminine: boolean }> = {
  sign: { noun: "Contratação", feminine: true },
  payClause: { noun: "Multa rescisória", feminine: true },
  sell: { noun: "Venda", feminine: true },
  renew: { noun: "Renovação", feminine: true },
  loanIn: { noun: "Empréstimo", feminine: false },
  loanOut: { noun: "Empréstimo", feminine: false },
  recall: { noun: "Volta antecipada", feminine: true },
};

/** "Venda de Zé" */
export const requestTitle = (request: CoachRequest, name: string): string => `${NOUNS[request.kind].noun} de ${name}`;

/** When the board will answer a request on its desk. */
export function pendingText(state: Pick<GameState, "date" | "coachClubId" | "players" | "market" | "hasMidSeasonWindow" | "coach">, request: CoachRequest): string {
  if (dueRequests(state, [request]).due.length) return "A diretoria responde amanhã.";
  // Tomorrow is outside the window, so the window that matters is the next one after tomorrow.
  return `Fica na mesa até a janela abrir, em ${formatDayMonth(windowStatus(addDays(state.date, 1), state).date)}.`;
}

/** "Contratação de Zé: recusada, sem verba" */
export function answerText({ request, name, approved, reason }: BoardAnswer): string {
  const ending = NOUNS[request.kind].feminine ? "a" : "o";
  return `${requestTitle(request, name)}: ${approved ? `aprovad${ending}` : `recusad${ending}, ${refusalText(reason)}`}`;
}
