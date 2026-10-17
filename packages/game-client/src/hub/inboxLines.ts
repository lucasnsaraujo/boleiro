import { WRONG_CALL_WORDS } from "../format/refereeCallWords.js";
import { guestClubOf } from "@boleiro/engine/sim/continental/guestClubs";
import type { GameState, IsoDate } from "@boleiro/engine/sim/gameState";
import type { InjuryKind } from "@boleiro/engine/sim/players/matchInjuryChance";
import type { Role } from "@boleiro/data/players";
import type { CoachRequest } from "@boleiro/engine/sim/transfers/coachRequest";
import { squadsOfGame } from "@boleiro/engine/sim/players/squadsByClub";
import { SQUAD_CAP } from "@boleiro/engine/sim/transfers/squadCap";
import { isInLastContractYear } from "@boleiro/engine/sim/transfers/renewalTerms";
import { isInPreContractWindow } from "@boleiro/engine/sim/transfers/tradeBetweenClubs";
import type { RenewalSkipReason } from "@boleiro/engine/sim/transfers/transferEvents";
import { copinhaRun } from "@boleiro/engine/sim/youth/copinha";
import type { AdvanceResult } from "../engine/createEngineSession.js";
import { competitionKeyName, competitionName } from "../format/competitionName.js";
import { formatContractLength } from "../format/formatContractLength.js";
import { formatDayMonth, formatMonthYear, monthName } from "../format/formatGameDate.js";
import { formatMoney } from "../format/formatMoney.js";
import { boardGoal } from "../screens/clubChoices.js";
import { copinhaRoundName } from "../format/copinhaRoundName.js";
import { SLOT_NAMES } from "../sponsors/sponsorsPage.js";

export type DayEvent = AdvanceResult["events"][number];
export type InboxTone = "good" | "bad" | "neutral";
/** One line of the hub's inbox, as a newspaper would print it. */
export type InboxLine = { date: IsoDate; text: string; tone: InboxTone };

export type NewsState = Pick<GameState, "date" | "coachClubId" | "clubs" | "players" | "competitions" | "market" | "world" | "youth"> & Partial<Pick<GameState, "history">>;

const REQUEST_NOUNS: Record<CoachRequest["kind"], string> = {
  sign: "a contratação",
  payClause: "o pagamento da multa rescisória",
  sell: "a venda",
  renew: "a renovação",
  loanIn: "o empréstimo",
  loanOut: "o empréstimo",
  recall: "a volta antecipada",
};

const REFUSALS: Record<string, string> = {
  transferBudget: "sem verba",
  wageCap: "passa do teto salarial",
  windowClosed: "janela fechada",
  playerUnwilling: "o jogador não quer vir",
  sellerWillNotSell: "o clube dele não vende",
  rivalWillNotSell: "o clube dele não negocia com ídolo de rival",
  idolRefusesRival: "ídolo do clube dele, ele não veste a camisa do rival",
  noBuyer: "ninguém fez proposta",
  noBorrower: "nenhum clube quis",
  lenderNotBigger: "o clube dele não é maior que o nosso",
  lenderNeedsHim: "o clube dele não libera",
  tooOld: "velho demais para empréstimo",
  loanLimit: "a FIFA limita a seis os empréstimos internacionais de cada clube",
  nationalLoanLimit: "a CBF limita a 16 os empréstimos nacionais de cada clube",
  loanPairLimit: "o regulamento limita a três os empréstimos entre os mesmos clubes",
  preContractSigned: "ele já assinou pré-contrato",
  alreadyAtClub: "ele já joga aqui",
  onLoan: "ele está emprestado",
  notAtClub: "ele não é mais do clube",
  notAvailable: "ele não está disponível",
  squadFull: `o elenco já tem ${SQUAD_CAP} jogadores`,
  offerTooLow: "o clube dele nem quis conversar com essa oferta",
  lengthRefused: "ele não aceita esse tempo de contrato",
  wageTooLow: "ele quer bem mais do que o oferecido",
  playerCounter: "ele fez uma contraproposta",
  counterOffer: "o clube dele fez uma contraproposta",
};

/** Why the board said no, in a few words. */
export const refusalText = (reason: string | null): string => (reason && REFUSALS[reason]) ?? "pedido negado";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const INJURY_NAMES: Record<Exclude<InjuryKind, "knock">, string> = { muscle: "lesão muscular", ligament: "lesão ligamentar" };
// A knock that keeps him out more than a week (UEFA's minor band) is news as an injury, not a knock.
const KNOCK_DAYS = 7;

const ROLE_NAMES: Record<Role, string> = { goleiro: "goleiro", lateral: "lateral", zagueiro: "zagueiro", meia: "meio-campista", atacante: "atacante" };

/** Every prize of the season one of the coach's players won, the biggest first. */
function awardLines({ season, awards }: Extract<DayEvent, { type: "seasonAwarded" }>, isOurs: (clubId: string) => boolean): [string, InboxTone][] {
  const lines: [string, InboxTone][] = [];
  const { bolaDeOuro, bolaDePrata, topScorer, bestYoung, ballonDor } = awards;
  if (bolaDeOuro && isOurs(bolaDeOuro.clubId)) lines.push([`${bolaDeOuro.name} ganha a Bola de Ouro de ${season}: o melhor do Brasileirão`, "good"]);
  for (const p of bolaDePrata) if (isOurs(p.clubId)) lines.push([`${p.name} ganha a Bola de Prata de ${ROLE_NAMES[p.role]}`, "good"]);
  if (topScorer && isOurs(topScorer.clubId)) lines.push([`${topScorer.name} é o artilheiro do Brasileirão, com ${topScorer.goals} gols`, "good"]);
  if (bestYoung && isOurs(bestYoung.clubId)) lines.push([`${bestYoung.name} é a revelação do Brasileirão`, "good"]);
  const [best] = ballonDor;
  if (best && isOurs(best.clubId)) lines.push([`${best.name} ganha a Bola de Ouro da France Football: o melhor do mundo`, "good"]);
  return lines;
}

/** A record the coach's club or player broke, in the club's or the league's history. */
function recordText({ scope, competition, kind, name, value, previous }: Extract<DayEvent, { type: "recordBroken" }>): string {
  const whose = scope === "league" && competition ? `da ${competitionKeyName(competition)}` : "do clube";
  switch (kind) {
    case "mostSeasonGoals":
      return `Recorde: ${name} chega a ${value} gols e passa o recorde ${whose} numa temporada (${previous})`;
    case "youngestScorer":
      return `Recorde: ${name}, ${value} anos, é o goleador mais jovem da história ${whose}`;
    case "longestUnbeaten":
      return `Recorde: ${value} jogos sem perder, a maior invencibilidade ${whose}`;
    case "biggestWin":
      return `Recorde: a maior goleada da história ${whose}, por ${value} gols de diferença`;
  }
}

/** "Pedro lesionado: lesão muscular, 12 dias fora"; a recurrence "volta a se lesionar", a short knock "sente uma pancada". */
function injuryText(name: string, { kind, days, isRecurrence }: Extract<DayEvent, { type: "playerInjured" }>): string {
  const out = `${days} dias fora`;
  if (kind === "knock" && days <= KNOCK_DAYS) return `${name} sente uma pancada: ${out}`;
  const what = kind && kind !== "knock" ? `${INJURY_NAMES[kind]}, ${out}` : out;
  return `${name} ${isRecurrence ? "volta a se lesionar" : "lesionado"}: ${what}`;
}

/**
 * The inbox lines one day's events give the player's coach: his matches, his club's
 * money, squad and supporters, the board's answers and his own career. Other clubs' news is left out.
 */
export function inboxLines(before: NewsState, after: NewsState, events: readonly DayEvent[]): InboxLine[] {
  const coachClubId = before.coachClubId;
  // On the day he changes clubs, both the club he left and the one he joined are his news.
  const isOurs = (clubId: string | null) => clubId !== null && (clubId === coachClubId || clubId === after.coachClubId);
  const clubName = (clubId: string) => after.clubs[clubId]?.shortName ?? before.clubs[clubId]?.shortName ?? guestClubOf(after, clubId)?.name ?? clubId;
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
        const extraTime = result.isAfterExtraTime ? " (prorr.)" : "";
        const score = `${clubName(homeId)} ${result.homeGoals} x ${result.awayGoals} ${clubName(awayId)}${extraTime}${shootout}`;
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
        return isOurs(event.clubId) ? [injuryText(playerName(event.playerId), event), "bad"] : null;
      case "playerSuspended":
        return isOurs(event.clubId) ? [`${playerName(event.playerId)} suspenso: ${plural(event.matches, "jogo", "jogos")}`, "bad"] : null;
      case "playerBooked":
      case "playerSentOff":
      case "stageOpened":
        return null;
      case "playerRetired":
        return isOurs(event.clubId) ? [`${event.name} se aposenta aos ${event.age} anos`, "neutral"] : null;
      case "playerWantsToRetire":
        return isOurs(event.clubId) ? [`${event.name} anuncia que ${event.afterSeason} será sua última temporada. Converse com ele na página do jogador`, "neutral"] : null;
      case "playerPersuaded":
        if (!isOurs(event.clubId)) return null;
        return event.stays ? [`${event.name} aceita jogar mais um ano`, "good"] : [`${event.name} não muda de ideia e para no fim da temporada`, "bad"];
      case "seasonAwarded":
        return null;
      case "recordBroken":
        return isOurs(event.clubId) ? [recordText(event), "good"] : null;
      case "youthPromoted":
        if (!isOurs(event.clubId)) return null;
        return [event.byAssistant ? `O auxiliar subiu ${playerName(event.playerId)} da base` : `${playerName(event.playerId)} sobe da base`, "neutral"];
      case "prospectReleased":
        return isOurs(event.clubId) ? [`${event.name} fez 21 anos e deixou a base, dispensado`, "neutral"] : null;
      case "refereeCall": {
        const { call, referee } = event;
        if (call.type !== "wrongCall" || !isOurs(call.againstId)) return null;
        return [`Polêmica com ${referee ?? "a arbitragem"}: ${WRONG_CALL_WORDS[call.call](playerName(call.playerId)).toLowerCase()}`, "bad"];
      }
      case "squadToppedUp":
        return isOurs(event.clubId) ? [`Elenco completado com ${plural(event.playerIds.length, "garoto da base", "garotos da base")}`, "neutral"] : null;
      case "youthTrialsHeld":
        return isOurs(event.clubId) ? [`Peneira: ${plural(event.prospectIds.length, "garoto novo", "garotos novos")} na base`, "neutral"] : null;
      case "copinhaPlayed": {
        const copinha = after.youth?.copinha;
        const ours = coachClubId && copinha ? copinhaRun(copinha, coachClubId) : null;
        if (!ours || !coachClubId) return null;
        if (ours.isChampion) return [`${clubName(coachClubId)} campeão da Copinha`, "good"];
        const last = ours.matches.at(-1);
        const winner = last && (last.penaltyWinnerId ?? (last.homeGoals > last.awayGoals ? last.homeId : last.awayId));
        const by = winner && winner !== coachClubId ? ` pelo ${clubName(winner)}` : "";
        return [`Copinha: base eliminada na ${copinhaRoundName(ours.lastRoundSize)}${by}`, "bad"];
      }
      case "prizePaid": {
        const paid = competition(event.competitionId);
        return isOurs(event.clubId) ? [`${paid ? competitionName(paid) : "Copa do Brasil"}: prêmio de ${formatMoney(event.amount)}`, "good"] : null;
      }
      case "titleBonusPaid":
        return isOurs(event.clubId) ? [`Bicho do título pago ao elenco: ${formatMoney(event.amount)}`, "neutral"] : null;
      case "friendlyPlayed": {
        const { homeId, awayId, result, fee } = event.friendly;
        if (!result || !(isOurs(homeId) || isOurs(awayId))) return null;
        const score = `Amistoso: ${clubName(homeId)} ${result.homeGoals} x ${result.awayGoals} ${clubName(awayId)}`;
        if (isOurs(awayId)) return [`${score}, cachê de ${formatMoney(fee)}`, "good"];
        return [`${score}, bilheteria de ${formatMoney(event.gate)} e cachê pago de ${formatMoney(fee)}`, event.gate >= fee ? "neutral" : "bad"];
      }
      case "friendlyCalledOff": {
        const { homeId, awayId } = event.friendly;
        if (!(isOurs(homeId) || isOurs(awayId))) return null;
        const against = `Amistoso contra o ${clubName(isOurs(homeId) ? awayId : homeId)} cancelado`;
        if (event.reason === "fixture") return [`${against}: a data virou jogo oficial`, "neutral"];
        if (event.reason === "cash") return [`${against}: o mandante ficou sem caixa para o cachê`, "bad"];
        return [against, "neutral"];
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
      case "assistantLeft":
        return [`${clubName(event.clubId)} não paga o salário de ${event.name}: seu auxiliar não vem com você`, "bad"];
      case "coachFired":
        if (!event.isYou) return null;
        return [`${clubName(event.clubId)} demite você: ${event.position}º lugar, a meta era ${event.targetPosition}º`, "bad"];
      case "coachAppointed":
        // Only a club he once coached: his successor there is his news.
        if (!before.history?.coach.stints.some((stint) => stint.clubId === event.clubId)) return null;
        return [`${clubName(event.clubId)} anuncia ${event.name} como novo técnico`, "neutral"];
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
        if (event.byAssistant) return [`O auxiliar vendeu ${name}, fora dos planos, por ${formatMoney(fee)} (${toClubId ? clubName(toClubId) : "exterior"})`, "neutral"];
        if (kind === "abroad") return [`${name} vendido ao exterior por ${formatMoney(fee)}`, "neutral"];
        if (kind === "released") return [`${name} deixa o clube no fim do contrato`, "neutral"];
        const to = toClubId ? clubName(toClubId) : "exterior";
        if (kind === "loan") return [`${name} emprestado (${to})`, "neutral"];
        if (kind === "loanReturn") return [`${name} volta para ${to}`, "neutral"];
        if (kind === "releaseClause") return [`${name} sai: ${to} paga a multa rescisória, ${formatMoney(fee)}`, "bad"];
        if (fee === 0) return [`${name} sai sem custo (${to})`, "neutral"];
        return [`${name} vendido por ${formatMoney(fee)} (${to})`, "neutral"];
      }
      case "playerContractRenewed":
        // The assistant's renewals are told together (assistantLines).
        if (!isOurs(event.clubId) || event.byAssistant) return null;
        return [`${playerName(event.playerId)} renova até ${event.until.slice(0, 4)}`, "neutral"];
      case "renewalCountered":
        return [`${playerName(event.playerId)} pede ${formatMoney(event.wage)} por mês para renovar por ${formatContractLength(event.months)}. Responda na renovação`, "neutral"];
      case "renewalSkipped":
        return null;
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
      case "eventHappened":
        return !event.asksCoach && isOurs(event.clubId) ? [event.headline, "neutral"] : null;
      case "eventAnswered":
        return isOurs(event.clubId) ? [event.byAssistant ? `${event.topic}: o auxiliar respondeu “${event.answer.replace(/^“|”$/g, "")}”` : event.headline, "neutral"] : null;
      case "eggFound":
        return isOurs(event.clubId) ? [`Raridade: ${event.headline}`, "good"] : null;
      case "sponsorOffers":
        return isOurs(event.clubId) ? [`${plural(event.count, "proposta", "propostas")} de patrocínio na mesa`, "neutral"] : null;
      case "sponsorSigned": {
        if (!isOurs(event.clubId)) return null;
        const who = event.byBoard ? "Diretoria fecha com" : "Fechado com";
        return [`${who} ${event.brandName} (${SLOT_NAMES[event.slot].toLowerCase()}): ${formatMoney(event.yearly)} por ano, ${plural(event.years, "temporada", "temporadas")}`, "good"];
      }
      case "sponsorBonusPaid":
        return isOurs(event.clubId) ? [`${event.brandName} paga bônus por ${event.reason === "title" ? "título" : "vaga continental"}: ${formatMoney(event.amount)}`, "good"] : null;
      case "requestDecided": {
        // The counter-offer's own line says what the club or the player asks.
        if (event.reason === "counterOffer" || event.reason === "playerCounter") return null;
        const noun = REQUEST_NOUNS[event.request.kind];
        const player = playerName(event.request.playerId);
        if (event.approved) return [`Diretoria aprova ${noun} de ${player}`, "good"];
        return [`Diretoria recusa ${noun} de ${player}: ${refusalText(event.reason)}`, "bad"];
      }
    }
  }

  const lines = events.flatMap((event) => {
    const found = event.type === "seasonAwarded" ? awardLines(event, isOurs) : [lineOf(event)];
    return found.flatMap((line) => (line ? [{ date: before.date, text: line[0], tone: line[1] }] : []));
  });
  const assistant = assistantLines(events.filter((e) => "clubId" in e && isOurs(e.clubId)), playerName).map(([text, tone]) => ({ date: before.date, text, tone }));
  return [...lines, ...assistant, ...lastYearWarnings(before, after), ...preContractWarnings(before, after)];
}

const SKIP_REASONS: readonly RenewalSkipReason[] = ["notInPlans", "playerUnwilling", "wageCap"];

/** What the coach's assistant did with the contracts in one look: a line for his renewals and one per reason he left others. */
function assistantLines(events: readonly DayEvent[], playerName: (id: string) => string): [string, InboxTone][] {
  const renewed = events.flatMap((e) => (e.type === "playerContractRenewed" && e.byAssistant ? [e] : []));
  const skipped = events.flatMap((e) => (e.type === "renewalSkipped" ? [e] : []));
  const lines: [string, InboxTone][] = [];
  const [onlyRenewed] = renewed;
  if (renewed.length === 1 && onlyRenewed) {
    lines.push([`O auxiliar renovou com ${playerName(onlyRenewed.playerId)} até ${formatMonthYear(onlyRenewed.until)}, por ${formatMoney(onlyRenewed.wage)} por mês`, "good"]);
  } else if (renewed.length > 1) lines.push([`O auxiliar renovou ${renewed.length} contratos: ${listNames(renewed.map((e) => playerName(e.playerId)))}`, "good"]);
  for (const reason of SKIP_REASONS) {
    const left = skipped.filter((e) => e.reason === reason);
    const [only] = left;
    if (!only) continue;
    lines.push([left.length === 1 ? skippedRenewalText(playerName(only.playerId), only.until, reason) : skippedRenewalsText(left.map((e) => playerName(e.playerId)), reason), "neutral"]);
  }
  return lines;
}

function skippedRenewalText(name: string, until: IsoDate, reason: RenewalSkipReason): string {
  switch (reason) {
    case "notInPlans":
      return `O auxiliar deixa acabar o contrato de ${name} (${formatMonthYear(until)}): está fora dos planos`;
    case "playerUnwilling":
      return `O auxiliar não renovou com ${name} (contrato até ${formatMonthYear(until)}): ele não aceita nenhum tempo de contrato`;
    case "wageCap":
      return `O auxiliar não renovou com ${name} (contrato até ${formatMonthYear(until)}): o salário passa do teto da folha`;
  }
}

function skippedRenewalsText(names: readonly string[], reason: RenewalSkipReason): string {
  switch (reason) {
    case "notInPlans":
      return `O auxiliar deixa acabar ${names.length} contratos: ${listNames(names)} (fora dos planos)`;
    case "playerUnwilling":
      return `O auxiliar não renovou com ${listNames(names)}: não aceitam nenhum tempo de contrato`;
    case "wageCap":
      return `O auxiliar não renovou com ${listNames(names)}: os salários passam do teto da folha`;
  }
}

/** The coach's players who entered the last year of their contract that day, as one line: he can still renew before anyone signs them. */
function lastYearWarnings(before: NewsState, after: NewsState): InboxLine[] {
  if (!after.coachClubId || after.coachClubId !== before.coachClubId || after.date === before.date) return [];
  const entering = (squadsOfGame(after).get(after.coachClubId) ?? [])
    .filter((p) => !after.market.preContracts[p.id] && !after.market.loans[p.id] && isInLastContractYear(p, after.date) && !isInLastContractYear(p, before.date))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const [only] = entering;
  if (!only) return [];
  const text =
    entering.length === 1
      ? `${only.name} entra no último ano de contrato (até ${formatMonthYear(only.contractUntil)}): renove antes que outros clubes possam assinar pré-contrato com ele`
      : `${entering.length} jogadores entram no último ano de contrato: ${listNames(entering.map((p) => p.name))}`;
  return [{ date: before.date, text, tone: "neutral" }];
}

/** "A", "A e B", "A, B e C". */
const listNames = (names: readonly string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`);

/** The coach's players who entered the last six months of their contract that day, when any club may sign them to a pre-contract. */
function preContractWarnings(before: NewsState, after: NewsState): InboxLine[] {
  if (!after.coachClubId || after.coachClubId !== before.coachClubId || after.date === before.date) return [];
  return (squadsOfGame(after).get(after.coachClubId) ?? [])
    .filter((p) => !after.market.preContracts[p.id] && !after.market.loans[p.id] && isInPreContractWindow(p, after.date) && !isInPreContractWindow(p, before.date))
    .map((p) => ({
      date: before.date,
      text: `${p.name} entra nos últimos seis meses de contrato (até ${formatDayMonth(p.contractUntil)}): outros clubes já podem assinar pré-contrato com ele`,
      tone: "bad",
    }));
}
