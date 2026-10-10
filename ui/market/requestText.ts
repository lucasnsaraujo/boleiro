import type { GameState } from "../../src/sim/gameState.js";
import type { CoachRequest } from "../../src/sim/transfers/coachRequest.js";
import { formatDayMonth } from "../format/formatGameDate.js";
import { refusalText } from "../hub/inboxLines.js";
import { dueRequests, type BoardAnswer } from "./boardDesk.js";
import { windowStatus } from "./marketSearch.js";

/** The request as a noun, and whether pt-BR treats it as feminine. */
const NOUNS: Record<CoachRequest["kind"], { noun: string; feminine: boolean }> = {
  sign: { noun: "Contratação", feminine: true },
  sell: { noun: "Venda", feminine: true },
  renew: { noun: "Renovação", feminine: true },
  loanIn: { noun: "Empréstimo", feminine: false },
  loanOut: { noun: "Empréstimo", feminine: false },
};

/** "Venda de Zé" */
export const requestTitle = (request: CoachRequest, name: string): string => `${NOUNS[request.kind].noun} de ${name}`;

/** When the board will answer a request on its desk. */
export function pendingText(state: Pick<GameState, "date" | "coachClubId" | "players" | "market">, request: CoachRequest): string {
  if (dueRequests(state, [request]).due.length) return "A diretoria responde amanhã.";
  return `Fica na mesa até a janela abrir, em ${formatDayMonth(windowStatus(state.date).date)}.`;
}

/** "Contratação de Zé: recusada, sem verba" */
export function answerText({ request, name, approved, reason }: BoardAnswer): string {
  const ending = NOUNS[request.kind].feminine ? "a" : "o";
  return `${requestTitle(request, name)}: ${approved ? `aprovad${ending}` : `recusad${ending}, ${refusalText(reason)}`}`;
}
