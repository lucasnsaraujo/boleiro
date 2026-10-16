import { pickLineup } from "../../engine/match.js";
import type { Fixture, GameState, SimPlayer } from "../gameState.js";
import { boardRefusal } from "./boardRefusal.js";
import { marketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
import { isClubFull } from "./squadCap.js";
import type { PlayerMoved } from "./transferEvents.js";
import type { Loan } from "./transferMarket.js";
import { isHumanClub } from "../coach/humanCoaches.js";

// guess: clubs lend players up to 21 who are outside their 18 strongest, so they get minutes.
export const LOAN_MAX_AGE = 21;
const LOAN_OUTSIDE_TOP = 18;
// guess: the lender keeps paying half the wage.
export const LENDER_WAGE_SHARE = 0.5;
// guess: a club lends at most one player a market day, and only one in four market days.
const LENDS_CHANCE = 0.25;
const RANK = { A: 4, B: 3, C: 2, D: 1, state: 0 } as const;

// FIFA RSTP art. 10 (in force since July 2022, six from 2024/25): a club holds at most six professionals
// over 21 loaned out and six loaned in at a time, and at most three loaned between the same two clubs,
// any age. https://digitalhub.fifa.com/m/785652de48694c8c/original/Explanatory-Notes-on-the-New-Loan-Provisions-in-the-Regulations-on-the-Status-and-Transfer-of-Players.pdf
// guess: FIFA left domestic loans to each association; the game applies the same limits at home, and
// has no club-trained exemption.
const LOANS_OVER_AGE = 6;
const LOANS_BETWEEN_CLUBS = 3;

/** Which of FIFA's loan limits lending `player` from `lenderId` to `borrowerId` would break, if any. */
export function loanLimitOf(state: Pick<GameState, "players" | "market">, lenderId: string, borrowerId: string, player: Pick<SimPlayer, "age">): "loanLimit" | "loanPairLimit" | null {
  let between = 0;
  let lenderOut = 0;
  let borrowerIn = 0;
  for (const playerId in state.market.loans) {
    const loan = state.market.loans[playerId];
    const loanee = state.players[playerId];
    if (!loan || !loanee) continue;
    if (loan.fromClubId === lenderId && loanee.clubId === borrowerId) between++;
    if (loanee.age <= LOAN_MAX_AGE) continue;
    if (loan.fromClubId === lenderId) lenderOut++;
    if (loanee.clubId === borrowerId) borrowerIn++;
  }
  if (between >= LOANS_BETWEEN_CLUBS) return "loanPairLimit";
  return player.age > LOAN_MAX_AGE && (lenderOut >= LOANS_OVER_AGE || borrowerIn >= LOANS_OVER_AGE) ? "loanLimit" : null;
}

/**
 * `banned` with the players on loan at one side of the fixture from the club on the other. A Brazilian
 * loan deal usually makes the borrower pay a fine to field him against his owner (São Paulo owed Cuiabá
 * R$ 1 mi for six minutes of a loanee in 2025: https://www.portaltela.com/esporte/futebol/2025/10/13/sao-paulo-enfrenta-acao-por-divida-milionaria-envolvendo-jogador-da-base/).
 * guess: every loan has the clause and no club pays it.
 */
export function withLoaneesFacingOwner(banned: ReadonlySet<string>, state: Pick<GameState, "players" | "market">, fixture: Pick<Fixture, "homeId" | "awayId">): ReadonlySet<string> {
  let barred: Set<string> | null = null;
  for (const playerId in state.market.loans) {
    const owner = state.market.loans[playerId]?.fromClubId;
    const borrower = state.players[playerId]?.clubId;
    const facesOwner = (owner === fixture.homeId && borrower === fixture.awayId) || (owner === fixture.awayId && borrower === fixture.homeId);
    if (facesOwner) (barred ??= new Set(banned)).add(playerId);
  }
  return barred ?? banned;
}

/** A loan to 31 December, or to 30 June when it starts in the first half of the year. */
export function loanUntil(date: string): string {
  return date.slice(5) < "07-01" ? `${date.slice(0, 4)}-06-30` : `${date.slice(0, 4)}-12-31`;
}

export function isLoanable(player: SimPlayer, squad: readonly SimPlayer[]): boolean {
  return player.age <= LOAN_MAX_AGE && squad.filter((p) => p.strength > player.strength).length >= LOAN_OUTSIDE_TOP;
}

/** Sends every loaned player whose loan ended back to his club, unless the borrower buys him with the clause. */
export function returnLoans(state: GameState): { state: GameState; events: PlayerMoved[] } {
  const events: PlayerMoved[] = [];
  let next = state;
  const ended = Object.entries(state.market.loans).filter(([, loan]) => loan.until < state.date);
  if (!ended.length) return { state, events };
  const view = marketView(state);
  for (const [playerId, loan] of ended.sort(([a], [b]) => a.localeCompare(b))) {
    const player = next.players[playerId];
    if (!player) continue;
    const borrower = player.clubId;
    const finance = next.finances[borrower];
    const starts = pickLineup([...view.squad(borrower)]).includes(player);
    const buys = !isHumanClub(state, borrower) && loan.buyOption !== null && starts && finance
      && !boardRefusal(finance, view.bill(borrower), { upFront: loan.buyOption, wageChange: Math.round(player.wage * loan.lenderWageShare) });
    const moved = buys
      ? movePlayer({ ...next, players: { ...next.players, [playerId]: { ...player, clubId: loan.fromClubId } } },
          { playerId, kind: "loanBuy", toClubId: borrower, fee: loan.buyOption ?? 0, contract: { wage: player.wage, until: player.contractUntil } })
      : movePlayer(next, { playerId, kind: "loanReturn", toClubId: loan.fromClubId, fee: 0 });
    next = moved.state;
    events.push(moved.event);
  }
  return { state: next, events };
}

/** One market day of Série A and B clubs lending young players to lower-division clubs that would play them. */
export function lendYoungPlayers(state: GameState, random: () => number): { state: GameState; events: PlayerMoved[] } {
  const events: PlayerMoved[] = [];
  let next = state;
  const view = marketView(next);
  const borrowers = Object.keys(state.finances).filter((id) => !isHumanClub(state, id) && RANK[view.tier(id)] <= RANK.C).sort();
  for (const lenderId of Object.keys(state.finances).sort()) {
    if (isHumanClub(state, lenderId) || RANK[view.tier(lenderId)] < RANK.B || random() >= LENDS_CHANCE) continue;
    const squad = view.squad(lenderId);
    const young = squad.filter((p) => p.age <= LOAN_MAX_AGE && !next.market.loans[p.id] && !next.market.preContracts[p.id] && isLoanable(p, squad));
    const player = young[Math.floor(random() * young.length)];
    if (!player) continue;
    const start = Math.floor(random() * borrowers.length);
    const borrowerId = [...borrowers.slice(start), ...borrowers.slice(0, start)].find((id) => {
      if (isClubFull(next, id, view.squad(id).length) || loanLimitOf(next, lenderId, id, player)) return false;
      const lineup = pickLineup([...view.squad(id)]);
      return lineup.some((p) => p.group === player.group && p.strength < player.strength);
    });
    if (!borrowerId) continue;
    const loan: Loan = { fromClubId: lenderId, until: loanUntil(state.date), lenderWageShare: LENDER_WAGE_SHARE, buyOption: null };
    const moved = movePlayer(next, { playerId: player.id, kind: "loan", toClubId: borrowerId, fee: 0, loan });
    next = moved.state;
    events.push(moved.event);
    view.record(player, next.players[player.id] ?? null);
  }
  return { state: next, events };
}
