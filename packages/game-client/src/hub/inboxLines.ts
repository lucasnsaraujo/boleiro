import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { SQUAD_CAP } from "@boleiro/engine/sim/transfers/squadCap";
import type { AdvanceResult } from "../engine/createEngineSession.js";
import { competitionName } from "../format/competitionName.js";
import { monthName } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { boardGoal } from "../screens/clubChoices.js";

export type DayEvent = AdvanceResult["events"][number];
export type InboxTone = "good" | "bad" | "neutral";
/** One line of the hub's inbox, as a newspaper would print it. */
export type InboxLine = { date: IsoDate; text: string; tone: InboxTone };

export type NewsState = Pick<GameState, "date" | "coachClubId" | "clubs" | "players" | "competitions" | "market">;

const REQUEST_NOUNS: Record<CoachRequest["kind"], string> = {
  sign: "a contratação",
  sell: "a venda",
  renew: "a renovação",
  loanIn: "o empréstimo",
  loanOut: "o empréstimo",
};

const REFUSALS: Record<string, string> = {
  transferBudget: "sem verba",
  wageCap: "passa do teto salarial",
  windowClosed: "janela fechada",
  playerUnwilling: "o jogador não quer vir",
  sellerWillNotSell: "o clube dele não vende",
  noBuyer: "ninguém fez proposta",
  noBorrower: "nenhum clube quis",
  lenderNotBigger: "o clube dele não é maior que o nosso",
  lenderNeedsHim: "o clube dele não libera",
  tooOld: "velho demais para empréstimo",
  preContractSigned: "ele já assinou pré-contrato",
  alreadyAtClub: "ele já joga aqui",
  onLoan: "ele está emprestado",
  notAtClub: "ele não é mais do clube",
  notAvailable: "ele não está disponível",
  squadFull: `o elenco já tem ${SQUAD_CAP} jogadores`,
  offerTooLow: "o clube dele nem quis conversar com essa oferta",
  counterOffer: "o clube dele fez uma contraproposta",
};

/** Why the board said no, in a few words. */
export const refusalText = (reason: string | null): string => (reason && REFUSALS[reason]) ?? "pedido negado";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The inbox lines one day's events give the player's coach: his matches, his club's
 * money, squad and supporters, the board's answers and his own career. Other clubs' news is left out.
 */
export function inboxLines(before: NewsState, after: NewsState, events: readonly DayEvent[]): InboxLine[] {
  const coachClubId = before.coachClubId;
  // On the day he changes clubs, both the club he left and the one he joined are his news.
  const isOurs = (clubId: string | null) => clubId !== null && (clubId === coachClubId || clubId === after.coachClubId);
  const clubName = (clubId: string) => after.clubs[clubId]?.shortName ?? before.clubs[clubId]?.shortName ?? clubId;
  const playerName = (playerId: string) =>
    after.players[playerId]?.name ?? before.players[playerId]?.name ?? after.market.freeAgents[playerId]?.name ?? "Um jogador";
  const competition = (id: string) => before.competitions[id] ?? after.competitions[id];
  const signedByRequest = new Set(events.flatMap((e) => (e.type === "requestDecided" && e.approved ? [e.request.playerId] : [])));

  function lineOf(event: DayEvent): [string, InboxTone] | null {
    switch (event.type) {
      case "matchPlayed": {
        const { homeId, awayId, result, competitionId } = event.fixture;
        if (!result || !(isOurs(homeId) || isOurs(awayId))) return null;
        const ours = isOurs(homeId) ? result.homeGoals - result.awayGoals : result.awayGoals - result.homeGoals;
        const shootout = result.penaltyWinnerId ? `, ${clubName(result.penaltyWinnerId)} nos pênaltis` : "";
        const tone: InboxTone = result.penaltyWinnerId ? (isOurs(result.penaltyWinnerId) ? "good" : "bad") : ours > 0 ? "good" : ours < 0 ? "bad" : "neutral";
        const played = competition(competitionId);
        const score = `${clubName(homeId)} ${result.homeGoals} x ${result.awayGoals} ${clubName(awayId)}${shootout}`;
        return [played ? `${competitionName(played)}: ${score}` : score, tone];
      }
      case "seasonEnded": {
        if (!coachClubId) return [`Fim da temporada ${event.season}`, "neutral"];
        for (const [id, outcome] of Object.entries(event.outcomes)) {
          const league = competition(id);
          const series = (preposition: string) => (league ? ` ${preposition} ${competitionName(league)}` : "");
          if (outcome.championId === coachClubId) return [`${clubName(coachClubId)} campeão${series("da")}`, "good"];
          if (outcome.promotedIds.includes(coachClubId)) return [`${clubName(coachClubId)} conquista o acesso${series("na")}`, "good"];
          if (outcome.relegatedIds.includes(coachClubId)) return [`${clubName(coachClubId)} rebaixado${series("na")}`, "bad"];
        }
        return [`Fim da temporada ${event.season}`, "neutral"];
      }
      case "monthClosed": {
        if (!isOurs(event.clubId)) return null;
        const sum = (lines: Record<string, number>) => Object.values(lines).reduce((total, amount) => total + amount, 0);
        const net = sum(event.ledger.revenue) - sum(event.ledger.costs);
        const result = net >= 0 ? `lucro de ${formatMoney(net)}` : `prejuízo de ${formatMoney(-net)}`;
        return [`Fechamento de ${monthName(Number(event.month.slice(5, 7)))}: ${result}`, net >= 0 ? "good" : "bad"];
      }
      case "wagesLate":
        return isOurs(event.clubId) ? [`Salários atrasados: ${formatMoney(event.owed)} em aberto`, "bad"] : null;
      case "forcedSale": {
        if (!isOurs(event.clubId)) return null;
        const buyer = event.buyerId ? clubName(event.buyerId) : "exterior";
        return [`Diretoria vendeu ${playerName(event.playerId)} por ${formatMoney(event.fee)} (${buyer})`, "bad"];
      }
      case "playerInjured":
        return isOurs(event.clubId) ? [`${playerName(event.playerId)} lesionado: ${event.days} dias fora`, "bad"] : null;
      case "playerSuspended":
        return isOurs(event.clubId) ? [`${playerName(event.playerId)} suspenso: ${plural(event.matches, "jogo", "jogos")}`, "bad"] : null;
      case "playerBooked":
      case "playerSentOff":
      case "stageOpened":
        return null;
      case "playerRetired":
        return isOurs(event.clubId) ? [`${event.name} se aposenta aos ${event.age} anos`, "neutral"] : null;
      case "youthPromoted":
        return isOurs(event.clubId) ? [`${playerName(event.playerId)} sobe da base`, "neutral"] : null;
      case "prizePaid": {
        const paid = competition(event.competitionId);
        return isOurs(event.clubId) ? [`${paid ? competitionName(paid) : "Copa do Brasil"}: prêmio de ${formatMoney(event.amount)}`, "good"] : null;
      }
      case "fansPressure":
        return isOurs(event.clubId) ? ["Torcida cobra o time", "bad"] : null;
      case "fansProtest":
        return isOurs(event.clubId) ? ["Protesto da torcida organizada", "bad"] : null;
      case "fansViolence":
        if (!isOurs(event.clubId)) return null;
        return [event.fine > 0 ? `Briga na torcida: multa de ${formatMoney(event.fine)}` : "Briga na torcida", "bad"];
      case "closedDoors":
        return isOurs(event.clubId) ? [`Punição: ${plural(event.games, "jogo", "jogos")} com portões fechados`, "bad"] : null;
      case "stadiumOpened":
        return isOurs(event.clubId) ? [`Obra pronta: ${event.seats.toLocaleString("pt-BR")} lugares novos, ${event.capacity.toLocaleString("pt-BR")} no total`, "good"] : null;
      case "coachHired":
        return [`${clubName(event.clubId)} anuncia você como técnico até ${event.untilSeason}`, "good"];
      case "coachFired":
        if (!event.isYou) return null;
        return [`${clubName(event.clubId)} demite você: ${event.position}º lugar, a meta era ${event.targetPosition}º`, "bad"];
      case "jobOffered": {
        const { clubId, salary, untilSeason } = event.offer;
        return [`${clubName(clubId)} faz proposta: ${formatMoney(salary)} por mês até ${untilSeason}`, "good"];
      }
      case "coachSeasonReviewed":
        return [`Balanço de ${event.season}: ${event.position}º lugar, a meta era ${event.targetPosition}º`, event.position <= event.targetPosition ? "good" : "bad"];
      case "contractRenewed":
        return [`Contrato renovado até ${event.untilSeason}`, "good"];
      case "contractEnded":
        return [`Fim do contrato com ${clubName(event.clubId)}`, "bad"];
      case "boardExpectationsSet": {
        const division = after.clubs[event.clubId]?.division;
        if (!isOurs(event.clubId)) return null;
        return division ? [`Meta da diretoria para ${event.season}: ${boardGoal(event, division)}`, "neutral"] : null;
      }
      case "playerMoved": {
        if (signedByRequest.has(event.playerId)) return null;
        const { kind, name, fromClubId, toClubId, fee } = event;
        if (isOurs(toClubId)) {
          if (kind === "loan") return [`${name} chega por empréstimo (${fromClubId ? clubName(fromClubId) : "exterior"})`, "good"];
          if (kind === "loanReturn") return [`${name} volta de empréstimo`, "neutral"];
          if (kind === "fromAbroad") return [`${name} chega do exterior por ${formatMoney(fee)}`, "good"];
          if (fee === 0) return [`${name} chega sem custo`, "good"];
          return [`${name} contratado por ${formatMoney(fee)}`, "good"];
        }
        if (!isOurs(fromClubId)) return null;
        if (kind === "abroad") return [`${name} vendido ao exterior por ${formatMoney(fee)}`, "neutral"];
        if (kind === "released") return [`${name} deixa o clube no fim do contrato`, "neutral"];
        const to = toClubId ? clubName(toClubId) : "exterior";
        if (kind === "loan") return [`${name} emprestado (${to})`, "neutral"];
        if (kind === "loanReturn") return [`${name} volta para ${to}`, "neutral"];
        if (fee === 0) return [`${name} sai sem custo (${to})`, "neutral"];
        return [`${name} vendido por ${formatMoney(fee)} (${to})`, "neutral"];
      }
      case "playerContractRenewed":
        return isOurs(event.clubId) ? [`${playerName(event.playerId)} renova até ${event.until.slice(0, 4)}`, "neutral"] : null;
      case "preContractSigned":
        if (isOurs(event.toClubId)) return [`${playerName(event.playerId)} assina pré-contrato com ${clubName(event.toClubId)}`, "good"];
        if (isOurs(event.fromClubId)) return [`${playerName(event.playerId)} assina pré-contrato com ${clubName(event.toClubId)}`, "bad"];
        return null;
      case "europeBid":
        if (!isOurs(event.clubId) || event.accepted) return null;
        return [`Proposta da Europa por ${playerName(event.playerId)} recusada: ${formatMoney(event.fee)}`, "neutral"];
      case "bidReceived": {
        const buyer = event.buyerId ? `do ${clubName(event.buyerId)}` : "da Europa";
        return [`Proposta ${buyer} por ${playerName(event.playerId)}: ${formatMoney(event.fee)}. Responda no mercado`, "neutral"];
      }
      case "auctionClosed":
        return event.sold ? null : [`Leilão de ${playerName(event.playerId)} termina sem lances`, "neutral"];
      case "counterOffered":
        return [`${clubName(event.clubId)} pede ${formatMoney(event.fee)} por ${playerName(event.playerId)}`, "neutral"];
      case "requestDecided": {
        // The counter-offer's own line says what the club asks.
        if (event.reason === "counterOffer") return null;
        const noun = REQUEST_NOUNS[event.request.kind];
        const player = playerName(event.request.playerId);
        if (event.approved) return [`Diretoria aprova ${noun} de ${player}`, "good"];
        return [`Diretoria recusa ${noun} de ${player}: ${refusalText(event.reason)}`, "bad"];
      }
    }
  }

  return events.flatMap((event) => {
    const found = lineOf(event);
    return found ? [{ date: before.date, text: found[0], tone: found[1] }] : [];
  });
}
