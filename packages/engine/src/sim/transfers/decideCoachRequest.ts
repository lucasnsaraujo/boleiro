import { pickLineup } from "../../engine/match.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { boardRefusal } from "./boardRefusal.js";
import type { CoachRequest } from "./coachRequest.js";
import { contractEnd } from "./expireContracts.js";
import { LENDER_WAGE_SHARE, LOAN_MAX_AGE, loanUntil } from "./loans.js";
import { marketView, type MarketView } from "./marketView.js";
import { movePlayer, type Transfer } from "./movePlayer.js";
import { ASKING_PREMIUM, isInPreContractWindow, MIN_SQUAD } from "./tradeBetweenClubs.js";
import type { TransferEvent } from "./transferEvents.js";
import { isWindowOpen } from "./transferWindows.js";
import { valuePlayer } from "./valuePlayer.js";
import { goingRate, wageDemand } from "./wageDemand.js";
import { willingToJoin } from "./willingToJoin.js";

type Outcome = { state: GameState; events: TransferEvent[] };
const RANK = { A: 4, B: 3, C: 2, D: 1, state: 0 } as const;
// guess: a renewal or a new deal can run at most five seasons (Lei 14.597/2023 caps contracts at five years).
const MAX_CONTRACT_YEARS = 5;

function refuse(state: GameState, request: CoachRequest, reason: string): Outcome {
  return { state, events: [{ type: "requestDecided", request, approved: false, reason }] };
}

function approve(state: GameState, request: CoachRequest, transfer: Transfer | null, extra: TransferEvent[] = []): Outcome {
  const decided: TransferEvent = { type: "requestDecided", request, approved: true, reason: null };
  if (!transfer) return { state, events: [decided, ...extra] };
  const moved = movePlayer(state, transfer);
  return { state: moved.state, events: [decided, moved.event, ...extra] };
}

function isWilling(view: MarketView, state: GameState, player: SimPlayer, clubId: string, wage: number, random: () => number, loan = false): boolean {
  const club = state.clubs[clubId];
  const unemployed = !state.players[player.id];
  return !!club && random() < willingToJoin({ player, from: view.tier(player.clubId), to: { tier: view.tier(clubId), fanbase: club.fanbase }, wage, unemployed, loan });
}

/** The board's answer to one coach request, and the move it makes when it says yes and the player agrees. */
export function decideCoachRequest(state: GameState, request: CoachRequest, random: () => number): Outcome {
  const coachClubId = state.coachClubId;
  const finance = coachClubId ? state.finances[coachClubId] : undefined;
  if (!coachClubId || !finance) return refuse(state, request, "noCoach");
  const view = marketView(state);
  const squad = view.squad(coachClubId);
  const bill = view.bill(coachClubId);
  const year = Number(state.date.slice(0, 4));
  const player = state.players[request.playerId] ?? state.market.freeAgents[request.playerId];
  if (!player) return refuse(state, request, "noPlayer");
  const own = state.players[player.id]?.clubId === coachClubId;
  const loan = state.market.loans[player.id];

  switch (request.kind) {
    case "sign": {
      if (own && loan?.buyOption != null) {
        const refused = boardRefusal(finance, bill, { upFront: loan.buyOption, wageChange: Math.round(player.wage * loan.lenderWageShare) });
        if (refused) return refuse(state, request, refused);
        const lent = { ...state, players: { ...state.players, [player.id]: { ...player, clubId: loan.fromClubId } } };
        return approve(lent, request, { playerId: player.id, kind: "loanBuy", toClubId: coachClubId, fee: loan.buyOption, contract: { wage: player.wage, until: player.contractUntil } });
      }
      if (own) return refuse(state, request, "alreadyAtClub");
      // The borrower can't sell what it doesn't own, and the owner can't sell a player it lent out.
      if (loan) return refuse(state, request, "onLoan");
      const free = !state.players[player.id];
      const preContract = !free && isInPreContractWindow(player, state.date);
      if (!free && !preContract && !isWindowOpen(state.date)) return refuse(state, request, "windowClosed");
      if (!free && !preContract && view.squad(player.clubId).length <= MIN_SQUAD) return refuse(state, request, "sellerWillNotSell");
      const wage = free ? Math.max(1, goingRate(player.strength, squad)) : wageDemand(player, squad);
      const fee = free || preContract ? 0 : Math.round(valuePlayer(player, view.tier(player.clubId), state.date) * state.market.eurBrl * ASKING_PREMIUM);
      const refused = boardRefusal(finance, bill, { upFront: fee + 3 * wage, wageChange: wage });
      if (refused) return refuse(state, request, refused);
      if (!isWilling(view, state, player, coachClubId, wage, random)) return refuse(state, request, "playerUnwilling");
      const contract = { wage, until: contractEnd(year + 1, random) };
      if (preContract) {
        const signed = { ...state, market: { ...state.market, preContracts: { ...state.market.preContracts, [player.id]: coachClubId } } };
        return approve(signed, request, null, [{ type: "preContractSigned", playerId: player.id, fromClubId: player.clubId, toClubId: coachClubId }]);
      }
      return approve(state, request, { playerId: player.id, kind: free ? "freeAgent" : "transfer", toClubId: coachClubId, fee, contract });
    }
    case "sell": {
      if (!own || loan) return refuse(state, request, "notAtClub");
      if (!isWindowOpen(state.date)) return refuse(state, request, "windowClosed");
      const fee = Math.round(valuePlayer(player, view.tier(coachClubId), state.date) * state.market.eurBrl);
      const buyerId = Object.keys(state.finances)
        .filter((id) => id !== coachClubId)
        .sort((a, b) => (state.clubs[b]?.fanbase ?? 0) - (state.clubs[a]?.fanbase ?? 0) || a.localeCompare(b))
        .find((id) => {
          const buyerFinance = state.finances[id];
          const wage = wageDemand(player, view.squad(id));
          return buyerFinance && !boardRefusal(buyerFinance, view.bill(id), { upFront: fee + 3 * wage, wageChange: wage })
            && isWilling(view, state, player, id, wage, random);
        });
      if (!buyerId) return refuse(state, request, "noBuyer");
      const contract = { wage: wageDemand(player, view.squad(buyerId)), until: contractEnd(year + 1, random) };
      return approve(state, request, { playerId: player.id, kind: "transfer", toClubId: buyerId, fee, contract });
    }
    case "renew": {
      if (!own || loan) return refuse(state, request, "notAtClub");
      if (state.market.preContracts[player.id]) return refuse(state, request, "preContractSigned");
      const years = Math.min(MAX_CONTRACT_YEARS, Math.max(1, Math.round(request.years)));
      const wage = Math.max(player.wage, goingRate(player.strength, squad));
      const refused = boardRefusal(finance, bill, { upFront: 0, wageChange: wage - player.wage });
      if (refused) return refuse(state, request, refused);
      if (!isWilling(view, state, player, coachClubId, wage, random)) return refuse(state, request, "playerUnwilling");
      const until = `${Math.max(year, Number(player.contractUntil.slice(0, 4))) + years}-12-31`;
      const renewed = { ...state, players: { ...state.players, [player.id]: { ...player, wage, contractUntil: until } } };
      return approve(renewed, request, null, [{ type: "playerContractRenewed", playerId: player.id, clubId: coachClubId, until, wage }]);
    }
    case "loanIn": {
      if (own || !state.players[player.id] || loan) return refuse(state, request, "notAvailable");
      if (!isWindowOpen(state.date)) return refuse(state, request, "windowClosed");
      if (RANK[view.tier(player.clubId)] <= RANK[view.tier(coachClubId)]) return refuse(state, request, "lenderNotBigger");
      if (pickLineup([...view.squad(player.clubId)]).includes(player)) return refuse(state, request, "lenderNeedsHim");
      const share = Math.round(player.wage * (1 - LENDER_WAGE_SHARE));
      const refused = boardRefusal(finance, bill, { upFront: 0, wageChange: share });
      if (refused) return refuse(state, request, refused);
      if (!isWilling(view, state, player, coachClubId, player.wage, random, true)) return refuse(state, request, "playerUnwilling");
      const buyOption = Math.round(valuePlayer(player, view.tier(player.clubId), state.date) * state.market.eurBrl * ASKING_PREMIUM);
      const until = loanUntil(state.date);
      return approve(state, request, { playerId: player.id, kind: "loan", toClubId: coachClubId, fee: 0, loan: { fromClubId: player.clubId, until, lenderWageShare: LENDER_WAGE_SHARE, buyOption } });
    }
    case "loanOut": {
      if (!own || loan) return refuse(state, request, "notAtClub");
      if (!isWindowOpen(state.date)) return refuse(state, request, "windowClosed");
      if (player.age > LOAN_MAX_AGE) return refuse(state, request, "tooOld");
      const borrowerId = Object.keys(state.finances).sort().find((id) =>
        RANK[view.tier(id)] < RANK[view.tier(coachClubId)] && pickLineup([...view.squad(id)]).some((p) => p.group === player.group && p.strength < player.strength));
      if (!borrowerId) return refuse(state, request, "noBorrower");
      return approve(state, request, { playerId: player.id, kind: "loan", toClubId: borrowerId, fee: 0, loan: { fromClubId: coachClubId, until: loanUntil(state.date), lenderWageShare: LENDER_WAGE_SHARE, buyOption: null } });
    }
  }
}
