import { pickLineup } from "../../engine/match.js";
import { boardRefusal } from "./boardRefusal.js";
import { marketView } from "./marketView.js";
import { movePlayer } from "./movePlayer.js";
// guess: clubs lend players up to 21 who are outside their 18 strongest, so they get minutes.
export const LOAN_MAX_AGE = 21;
const LOAN_OUTSIDE_TOP = 18;
// guess: the lender keeps paying half the wage.
export const LENDER_WAGE_SHARE = 0.5;
// guess: a club lends at most one player a market day, and only one in four market days.
const LENDS_CHANCE = 0.25;
const RANK = { A: 4, B: 3, C: 2, D: 1, state: 0 };
/** A loan to 31 December, or to 30 June when it starts in the first half of the year. */
export function loanUntil(date) {
    return date.slice(5) < "07-01" ? `${date.slice(0, 4)}-06-30` : `${date.slice(0, 4)}-12-31`;
}
export function isLoanable(player, squad) {
    return player.age <= LOAN_MAX_AGE && squad.filter((p) => p.strength > player.strength).length >= LOAN_OUTSIDE_TOP;
}
/** Sends every loaned player whose loan ended back to his club, unless the borrower buys him with the clause. */
export function returnLoans(state) {
    const events = [];
    let next = state;
    const ended = Object.entries(state.market.loans).filter(([, loan]) => loan.until < state.date);
    if (!ended.length)
        return { state, events };
    const view = marketView(state);
    for (const [playerId, loan] of ended.sort(([a], [b]) => a.localeCompare(b))) {
        const player = next.players[playerId];
        if (!player)
            continue;
        const borrower = player.clubId;
        const finance = next.finances[borrower];
        const starts = pickLineup([...view.squad(borrower)]).includes(player);
        const buys = borrower !== state.coachClubId && loan.buyOption !== null && starts && finance
            && !boardRefusal(finance, view.bill(borrower), { upFront: loan.buyOption, wageChange: Math.round(player.wage * loan.lenderWageShare) });
        const moved = buys
            ? movePlayer({ ...next, players: { ...next.players, [playerId]: { ...player, clubId: loan.fromClubId } } }, { playerId, kind: "loanBuy", toClubId: borrower, fee: loan.buyOption ?? 0, contract: { wage: player.wage, until: player.contractUntil } })
            : movePlayer(next, { playerId, kind: "loanReturn", toClubId: loan.fromClubId, fee: 0 });
        next = moved.state;
        events.push(moved.event);
    }
    return { state: next, events };
}
/** One market day of Série A and B clubs lending young players to lower-division clubs that would play them. */
export function lendYoungPlayers(state, random) {
    const events = [];
    let next = state;
    const view = marketView(next);
    const borrowers = Object.keys(state.finances).filter((id) => id !== state.coachClubId && RANK[view.tier(id)] <= RANK.C).sort();
    for (const lenderId of Object.keys(state.finances).sort()) {
        if (lenderId === state.coachClubId || RANK[view.tier(lenderId)] < RANK.B || random() >= LENDS_CHANCE)
            continue;
        const squad = view.squad(lenderId);
        const young = squad.filter((p) => p.age <= LOAN_MAX_AGE && !next.market.loans[p.id] && !next.market.preContracts[p.id] && isLoanable(p, squad));
        const player = young[Math.floor(random() * young.length)];
        if (!player)
            continue;
        const start = Math.floor(random() * borrowers.length);
        const borrowerId = [...borrowers.slice(start), ...borrowers.slice(0, start)].find((id) => {
            const lineup = pickLineup([...view.squad(id)]);
            return lineup.some((p) => p.group === player.group && p.strength < player.strength);
        });
        if (!borrowerId)
            continue;
        const loan = { fromClubId: lenderId, until: loanUntil(state.date), lenderWageShare: LENDER_WAGE_SHARE, buyOption: null };
        const moved = movePlayer(next, { playerId: player.id, kind: "loan", toClubId: borrowerId, fee: 0, loan });
        next = moved.state;
        events.push(moved.event);
        view.record(player, next.players[player.id] ?? null);
    }
    return { state: next, events };
}
