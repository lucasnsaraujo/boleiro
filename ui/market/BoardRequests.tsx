import type { GameState } from "../../src/sim/gameState.js";
import { formatDayMonth } from "../format/formatGameDate.js";
import type { BoardDesk } from "./boardDesk.js";
import { findPlayer } from "./coachRequests.js";
import { answerText, pendingText, requestTitle } from "./requestText.js";
import "./boardRequests.css";

type Props = {
  desk: BoardDesk;
  state: Pick<GameState, "date" | "coachClubId" | "players" | "market">;
  onWithdraw: (playerId: string) => void;
  /** How many answers to show, newest first, under the pending requests. */
  answers: number;
};

/** The coach's requests on the board's desk, then the board's latest answers. */
export function BoardRequests({ desk, state, onWithdraw, answers }: Props) {
  const shown = desk.answers.slice(-answers).toReversed();
  if (!desk.pending.length && !shown.length) return <p className="status">Nenhum pedido à diretoria.</p>;
  return (
    <ul className="board-desk" aria-label="Pedidos à diretoria">
      {desk.pending.map((request) => (
        <li key={`pending-${request.playerId}`} className="board-desk-row pending">
          <span className="board-desk-when">Na mesa</span>
          <span className="board-desk-text">
            {requestTitle(request, findPlayer(state, request.playerId)?.name ?? "jogador")}
            <small>{pendingText(state, request)}</small>
          </span>
          <button className="btn-quiet board-desk-withdraw" onClick={() => onWithdraw(request.playerId)}>
            Retirar
          </button>
        </li>
      ))}
      {shown.map((answer, index) => (
        <li key={`${answer.date}-${index}`} className={answer.approved ? "board-desk-row good" : "board-desk-row bad"}>
          <span className="board-desk-when">{formatDayMonth(answer.date)}</span>
          <span className="board-desk-text">{answerText(answer)}</span>
        </li>
      ))}
    </ul>
  );
}
