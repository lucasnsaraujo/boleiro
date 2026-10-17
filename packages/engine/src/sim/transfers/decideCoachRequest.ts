import { pickLineup } from "../../engine/match.js";
import { addDays } from "../dates.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { sellerPrice } from "./askingPrice.js";
import { boardRefusal } from "./boardRefusal.js";
import { coachMarketOf, standingRenewalCounter, withCoachMarket, withRenewalCounter } from "./coachMarket.js";
import type { CoachRequest } from "./coachRequest.js";
import { isClubFull } from "./squadCap.js";
import type { Counter } from "./transferMarket.js";
import { contractEnd } from "./expireContracts.js";
import { contractEndAfter, contractTerms, lengthPremium, NEUTRAL_TALKS, preferredMonths, type ContractMonths, type Stance } from "./contractTerms.js";
import { contractMonthsOf, renewalTermsOf, renewedUntil } from "./renewalTerms.js";
import { releaseClauseOf } from "./releaseClause.js";
import { LENDER_WAGE_SHARE, LOAN_MAX_AGE, loanLimitOf, loanUntil } from "./loans.js";
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
// guess: a player gives 8% off his ask on the length he wants, 4% on one he agrees to, nothing on a hard one;
// an offer within 15% under that gets his counter, at his ask, and a lower one he turns down.
const RENEWAL_GIVE: Record<Stance, number> = { wants: 0.08, agrees: 0.04, hard: 0, refuses: 0 };
const RENEWAL_COUNTER_BAND = 0.85;
// guess: on a length he finds hard he signs his full ask one time in two.
const HARD_LENGTH_CHANCE = 0.5;
// guess: a club counters an offer of at least 60% of its price and ignores a lower one; its counter stands a week.
const COUNTER_FLOOR = 0.6;
const COUNTER_DAYS = 7;

function refuse(state: GameState, request: CoachRequest, reason: string): Outcome {
  return { state, events: [{ type: "requestDecided", request, approved: false, reason }] };
}

function approve(state: GameState, request: CoachRequest, transfer: Transfer | null, extra: TransferEvent[] = []): Outcome {
  const decided: TransferEvent = { type: "requestDecided", request, approved: true, reason: null };
  if (!transfer) return { state, events: [decided, ...extra] };
  const moved = movePlayer(state, transfer);
  return { state: moved.state, events: [decided, moved.event, ...extra] };
}

/** What the selling club asks the coach in BRL: its counter while it stands, else its price by its need of the player. */
function clubPrice(state: GameState, view: MarketView, player: SimPlayer): number {
  const standing = coachMarketOf(state).counters[player.id];
  if (standing && standing.clubId === player.clubId && standing.until >= state.date) return standing.fee;
  return sellerPrice(player, view.squad(player.clubId), view.tier(player.clubId), state.date, state.market.eurBrl);
}

function counter(state: GameState, request: CoachRequest, offered: Counter): Outcome {
  const coach = coachMarketOf(state);
  const countered = withCoachMarket(state, { ...coach, counters: { ...coach.counters, [request.playerId]: offered } });
  return {
    state: countered,
    events: [
      { type: "requestDecided", request, approved: false, reason: "counterOffer" },
      { type: "counterOffered", playerId: request.playerId, clubId: offered.clubId, fee: offered.fee },
    ],
  };
}

function isWilling(view: MarketView, state: GameState, player: SimPlayer, clubId: string, wage: number, random: () => number, loan = false): boolean {
  const club = state.clubs[clubId];
  const unemployed = !state.players[player.id];
  return !!club && random() < willingToJoin({ player, from: view.tier(player.clubId), to: { tier: view.tier(clubId), fanbase: club.fanbase }, wage, unemployed, loan });
}

/**
 * The length a signing offers him, as months and how much it weighs against the wage (a length off the one
 * he wants is worth less to him); "refused" for a length he won't talk about. Without `years`, the club's
 * usual one to three seasons, which he takes as it comes.
 */
function signingLength(player: SimPlayer, squad: readonly SimPlayer[], years: number | undefined): { months: ContractMonths | null; premium: number } | "refused" {
  if (years === undefined) return { months: null, premium: 1 };
  const months = contractMonthsOf(years);
  const preferred = preferredMonths(player, squad);
  const stance = contractTerms(1, preferred, NEUTRAL_TALKS).find((term) => term.months === months)?.stance;
  return stance === "refuses" ? "refused" : { months, premium: 1 + lengthPremium(months, preferred) };
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
      // Another coach's request or an AI club may have got there first, earlier the same day.
      if (state.market.preContracts[player.id]) return refuse(state, request, "preContractSigned");
      if (isClubFull(state, coachClubId, squad.length)) return refuse(state, request, "squadFull");
      const free = !state.players[player.id];
      const preContract = !free && isInPreContractWindow(player, state.date);
      // A free agent signs any day: FIFA RSTP art. 6(1), which CBF's registration rules follow, lets a player
      // whose contract expired before a window closed register outside one (https://www.football-legal.com/content/players-registration-out-of-the-transfer-windows-its-exception-and-a-possible-fraud-to-the-rules).
      // guess: every free agent counts, released or expired, whenever it happened. A pre-contract only takes effect when his contract ends.
      if (!free && !preContract && !isWindowOpen(state, state.date)) return refuse(state, request, "windowClosed");
      if (!free && !preContract && view.squad(player.clubId).length <= MIN_SQUAD) return refuse(state, request, "sellerWillNotSell");
      let fee = 0;
      if (!free && !preContract) {
        // An offer without a fee pays what the club asks.
        const price = clubPrice(state, view, player);
        const offered = Math.round(request.fee ?? price);
        if (offered < price) {
          if (offered < price * COUNTER_FLOOR) return refuse(state, request, "offerTooLow");
          return counter(state, request, { clubId: player.clubId, fee: price, until: addDays(state.date, COUNTER_DAYS) });
        }
        fee = offered;
      }
      const wage = request.wage !== undefined ? Math.max(1, Math.round(request.wage)) : free ? Math.max(1, goingRate(player.strength, squad)) : wageDemand(player, squad);
      const length = signingLength(player, squad, request.years);
      if (length === "refused") return refuse(state, request, "lengthRefused");
      const refused = boardRefusal(finance, bill, { upFront: fee + 3 * wage, wageChange: wage });
      if (refused) return refuse(state, request, refused);
      if (!isWilling(view, state, player, coachClubId, wage / length.premium, random)) return refuse(state, request, "playerUnwilling");
      const contract = { wage, until: length.months === null ? contractEnd(year + 1, random) : contractEndAfter(state.date, length.months) };
      if (preContract) {
        const signed = { ...state, market: { ...state.market, preContracts: { ...state.market.preContracts, [player.id]: coachClubId } } };
        return approve(signed, request, null, [{ type: "preContractSigned", playerId: player.id, fromClubId: player.clubId, toClubId: coachClubId }]);
      }
      return approve(state, request, { playerId: player.id, kind: free ? "freeAgent" : "transfer", toClubId: coachClubId, fee, contract });
    }
    case "payClause": {
      if (own) return refuse(state, request, "alreadyAtClub");
      if (!state.players[player.id]) return refuse(state, request, "notAvailable");
      if (loan) return refuse(state, request, "onLoan");
      if (state.market.preContracts[player.id]) return refuse(state, request, "preContractSigned");
      if (isClubFull(state, coachClubId, squad.length)) return refuse(state, request, "squadFull");
      if (!isWindowOpen(state, state.date)) return refuse(state, request, "windowClosed");
      // His club has no say: the clause is paid and only the board and the player decide.
      const fee = releaseClauseOf(player, view.tier(player.clubId), state.market.eurBrl);
      const wage = request.wage !== undefined ? Math.max(1, Math.round(request.wage)) : wageDemand(player, squad);
      const length = signingLength(player, squad, request.years);
      if (length === "refused") return refuse(state, request, "lengthRefused");
      const refused = boardRefusal(finance, bill, { upFront: fee + 3 * wage, wageChange: wage });
      if (refused) return refuse(state, request, refused);
      if (!isWilling(view, state, player, coachClubId, wage / length.premium, random)) return refuse(state, request, "playerUnwilling");
      const until = length.months === null ? contractEnd(year + 1, random) : contractEndAfter(state.date, length.months);
      return approve(state, request, { playerId: player.id, kind: "releaseClause", toClubId: coachClubId, fee, contract: { wage, until } });
    }
    case "sell": {
      if (!own || loan) return refuse(state, request, "notAtClub");
      if (!isWindowOpen(state, state.date)) return refuse(state, request, "windowClosed");
      const fee = Math.round(valuePlayer(player, view.tier(coachClubId), state.date) * state.market.eurBrl);
      const buyerId = Object.keys(state.finances)
        .filter((id) => id !== coachClubId && !isClubFull(state, id, view.squad(id).length))
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
      const months = contractMonthsOf(request.years);
      const term = renewalTermsOf(state, player, squad).terms.find((t) => t.months === months);
      if (!term || term.stance === "refuses") return refuse(state, request, "lengthRefused");
      const offered = request.wage !== undefined ? Math.max(1, Math.round(request.wage)) : term.wage;
      // A counter of his that still stands signs at its wage; otherwise he gives a little off his ask on a length he likes.
      const standing = standingRenewalCounter(state, player.id);
      const isCounterMet = !!standing && standing.months === months && offered >= standing.wage;
      const floor = isCounterMet ? offered : Math.round(term.wage * (1 - RENEWAL_GIVE[term.stance]));
      if (offered < floor) {
        if (offered < floor * RENEWAL_COUNTER_BAND) return refuse(state, request, "wageTooLow");
        const counter = { months, wage: term.wage, until: addDays(state.date, COUNTER_DAYS), contractUntil: player.contractUntil };
        return {
          state: withCoachMarket(state, withRenewalCounter(coachMarketOf(state), player.id, counter)),
          events: [
            { type: "requestDecided", request, approved: false, reason: "playerCounter" },
            { type: "renewalCountered", playerId: player.id, months, wage: term.wage },
          ],
        };
      }
      const refused = boardRefusal(finance, bill, { upFront: 0, wageChange: offered - player.wage });
      if (refused) return refuse(state, request, refused);
      // His answer draws once from the market's stream whatever the length, so a renewal never shifts the draws after it.
      const draw = random();
      if (term.stance === "hard" && !isCounterMet && draw >= HARD_LENGTH_CHANCE) return refuse(state, request, "playerUnwilling");
      const until = renewedUntil(player, state.date, months);
      const renewed = { ...state, players: { ...state.players, [player.id]: { ...player, wage: offered, contractUntil: until } } };
      const settled = standing ? withCoachMarket(renewed, withRenewalCounter(coachMarketOf(renewed), player.id, null)) : renewed;
      return approve(settled, request, null, [{ type: "playerContractRenewed", playerId: player.id, clubId: coachClubId, until, wage: offered }]);
    }
    case "loanIn": {
      if (own || !state.players[player.id] || loan) return refuse(state, request, "notAvailable");
      if (isClubFull(state, coachClubId, squad.length)) return refuse(state, request, "squadFull");
      if (!isWindowOpen(state, state.date)) return refuse(state, request, "windowClosed");
      if (RANK[view.tier(player.clubId)] <= RANK[view.tier(coachClubId)]) return refuse(state, request, "lenderNotBigger");
      if (pickLineup([...view.squad(player.clubId)]).includes(player)) return refuse(state, request, "lenderNeedsHim");
      const limit = loanLimitOf(state, player.clubId, coachClubId, player);
      if (limit) return refuse(state, request, limit);
      const share = Math.round(player.wage * (1 - LENDER_WAGE_SHARE));
      const refused = boardRefusal(finance, bill, { upFront: 0, wageChange: share });
      if (refused) return refuse(state, request, refused);
      if (!isWilling(view, state, player, coachClubId, player.wage, random, true)) return refuse(state, request, "playerUnwilling");
      const buyOption = Math.round(valuePlayer(player, view.tier(player.clubId), state.date) * state.market.eurBrl * ASKING_PREMIUM);
      const until = loanUntil(state.date);
      return approve(state, request, { playerId: player.id, kind: "loan", toClubId: coachClubId, fee: 0, loan: { fromClubId: player.clubId, until, lenderWageShare: LENDER_WAGE_SHARE, buyOption } });
    }
    case "recall": {
      if (loan?.fromClubId !== coachClubId) return refuse(state, request, "notAtClub");
      // guess: a loan deal lets the lender call the player back, as Brazilian loans usually do; he must be registered again, so only in a window.
      if (!isWindowOpen(state, state.date)) return refuse(state, request, "windowClosed");
      if (isClubFull(state, coachClubId, squad.length)) return refuse(state, request, "squadFull");
      return approve(state, request, { playerId: player.id, kind: "loanReturn", toClubId: coachClubId, fee: 0 });
    }
    case "loanOut": {
      if (!own || loan) return refuse(state, request, "notAtClub");
      if (!isWindowOpen(state, state.date)) return refuse(state, request, "windowClosed");
      if (player.age > LOAN_MAX_AGE) return refuse(state, request, "tooOld");
      const borrowerId = Object.keys(state.finances).sort().find((id) =>
        RANK[view.tier(id)] < RANK[view.tier(coachClubId)] && !loanLimitOf(state, coachClubId, id, player) && pickLineup([...view.squad(id)]).some((p) => p.group === player.group && p.strength < player.strength));
      if (!borrowerId) return refuse(state, request, "noBorrower");
      return approve(state, request, { playerId: player.id, kind: "loan", toClubId: borrowerId, fee: 0, loan: { fromClubId: coachClubId, until: loanUntil(state.date), lenderWageShare: LENDER_WAGE_SHARE, buyOption: null } });
    }
  }
}
