import type { BidOutcome } from "@boleiro/engine/sim/transfers/answerBid";
import type { Bid } from "@boleiro/engine/sim/transfers/transferMarket";
import { formatMoney } from "../format/formatMoney.js";
import type { InboxLine, NewsState } from "./inboxLines.js";

/**
 * The line a hot-seat coach reads when another human coach answers his offer on his own turn: the sale,
 * the refusal, or the deal falling through after a yes; none for a counter, which only an AI club makes.
 */
export function offerAnswerLine(state: Pick<NewsState, "date" | "clubs" | "players">, sellerId: string, bid: Bid, outcome: BidOutcome): InboxLine | null {
  const seller = state.clubs[sellerId]?.shortName ?? sellerId;
  const name = state.players[bid.playerId]?.name ?? "o jogador";
  const line = (text: string, tone: InboxLine["tone"]): InboxLine => ({ date: state.date, text, tone });
  switch (outcome) {
    case "sold":
      return line(`${seller} aceitou a proposta: ${name} contratado por ${formatMoney(bid.fee)}`, "good");
    case "declined":
      return line(`${seller} recusou a proposta por ${name} (${formatMoney(bid.fee)})`, "bad");
    case "walkedAway":
      return line(`${seller} aceitou, mas a contratação de ${name} não saiu: sem verba ou elenco cheio`, "bad");
    case "finalOffer":
      return null;
  }
}
