import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { addDays } from "../dates.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import type { CoachRequest } from "./coachRequest.js";
import { wageBillsOf } from "./wageBillsOf.js";

const COACH = "flamengo-rj";
let windowEve = loadNewGame(4, { coachClubId: COACH });
while (windowEve.date < "2026-01-05") windowEve = advanceDay(windowEve, {}).state;

const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId);
const financeOf = (state: GameState, clubId: string): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};
const withFinance = (state: GameState, clubId: string, patch: Partial<ClubFinance>): GameState => ({
  ...state,
  finances: { ...state.finances, [clubId]: { ...financeOf(state, clubId), ...patch } },
});
const withPlayer = (state: GameState, player: SimPlayer): GameState => ({ ...state, players: { ...state.players, [player.id]: player } });
const rich = (state: GameState) => withFinance(state, COACH, { transferBudget: 1e10, wageCap: 1e10 });
const decisionsOf = (events: DayEvent[]) => events.flatMap((e) => (e.type === "requestDecided" ? [e] : []));

function ask(state: GameState, request: CoachRequest) {
  const day = advanceDay(state, { requests: [request] });
  const [decision] = decisionsOf(day.events);
  if (!decision) throw new Error("no decision");
  return { ...day, decision };
}

/** The strongest player of a Série B club, with years left on his contract. */
function serieBStandout(state: GameState): SimPlayer {
  const club = Object.values(state.clubs).find((c) => c.division === "B");
  const best = squadOf(state, club?.id ?? "").sort((a, b) => b.strength - a.strength)[0];
  if (!best) throw new Error("no Série B player");
  return { ...best, contractUntil: "2029-12-31" };
}

describe("the board's answer to a signing request", () => {
  const target = serieBStandout(windowEve);

  it("refuses when the fee does not fit the transfer budget", () => {
    const broke = withFinance(withPlayer(windowEve, target), COACH, { transferBudget: 0, wageCap: 1e10 });
    expect(ask(broke, { kind: "sign", playerId: target.id }).decision).toMatchObject({ approved: false, reason: "transferBudget" });
  });

  it("refuses when his wage would take the bill past the wage cap", () => {
    const capped = withFinance(withPlayer(windowEve, target), COACH, { transferBudget: 1e10, wageCap: wageBillsOf(windowEve).get(COACH) ?? 0 });
    expect(ask(capped, { kind: "sign", playerId: target.id }).decision).toMatchObject({ approved: false, reason: "wageCap" });
  });

  it("buys him when both fit and he wants the move, paying his old club and setting his arrival day", () => {
    const before = rich(withPlayer(windowEve, target));
    const { state, events, decision } = ask(before, { kind: "sign", playerId: target.id });
    expect(decision.approved).toBe(true);
    const moved = events.find((e) => e.type === "playerMoved" && e.playerId === target.id);
    expect(moved).toMatchObject({ kind: "transfer", fromClubId: target.clubId, toClubId: COACH });
    const fee = moved?.type === "playerMoved" ? moved.fee : 0;
    expect(fee).toBeGreaterThan(0);
    expect(state.players[target.id]).toMatchObject({ clubId: COACH, condition: { arrivedOn: state.date } });
    expect(financeOf(state, COACH).month.costs.transferFees - financeOf(before, COACH).month.costs.transferFees).toBe(fee);
    expect(financeOf(state, target.clubId).month.revenue.playerSales - financeOf(before, target.clubId).month.revenue.playerSales).toBe(fee);
  });

  it("refuses a player on loan at another club, leaving the loan and both clubs' money alone", () => {
    const borrowerId = Object.values(windowEve.clubs).find((c) => c.division === "C")?.id ?? "";
    const loan = { fromClubId: target.clubId, until: "2026-06-30", lenderWageShare: 0.5, buyOption: null };
    const lent = rich(withPlayer(windowEve, { ...target, clubId: borrowerId }));
    const before = { ...lent, market: { ...lent.market, loans: { ...lent.market.loans, [target.id]: loan } } };
    const { state, decision } = ask(before, { kind: "sign", playerId: target.id });
    expect(decision).toMatchObject({ approved: false, reason: "onLoan" });
    expect(state.players[target.id]?.clubId).toBe(borrowerId);
    expect(state.market.loans[target.id]).toEqual(loan);
  });

  it("refuses a transfer outside the windows", () => {
    let april = rich(withPlayer(windowEve, target));
    april = { ...april, date: "2026-04-10" };
    expect(ask(april, { kind: "sign", playerId: target.id }).decision).toMatchObject({ approved: false, reason: "windowClosed" });
  });
});

describe("contracts", () => {
  const ours = squadOf(windowEve, COACH).sort((a, b) => b.strength - a.strength)[0];
  if (!ours) throw new Error("no Flamengo player");

  it("let a player walk away as a free agent when his contract ends and nobody renewed it", () => {
    const ending = withPlayer(windowEve, { ...ours, contractUntil: addDays(windowEve.date, -1) });
    const { state, events } = advanceDay(ending, {});
    expect(state.players[ours.id]).toBeUndefined();
    expect(state.market.freeAgents[ours.id]).toBeDefined();
    expect(events).toContainEqual(expect.objectContaining({ type: "playerMoved", kind: "released", playerId: ours.id, fromClubId: COACH }));
  });

  it("are extended when the coach asks for a renewal and the board can pay", () => {
    const { state, decision, events } = ask(rich(windowEve), { kind: "renew", playerId: ours.id, years: 2 });
    expect(decision.approved).toBe(true);
    expect((state.players[ours.id]?.contractUntil ?? "") > ours.contractUntil).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: "playerContractRenewed", playerId: ours.id }));
  });

  it("let another club sign a pre-contract in the last six months, and take him for free when it ends", () => {
    const target = { ...serieBStandout(windowEve), contractUntil: addDays(windowEve.date, 120) };
    const { state, events, decision } = ask(rich(withPlayer(windowEve, target)), { kind: "sign", playerId: target.id });
    expect(decision.approved).toBe(true);
    expect(events).toContainEqual({ type: "preContractSigned", playerId: target.id, fromClubId: target.clubId, toClubId: COACH });
    expect(state.players[target.id]?.clubId).toBe(target.clubId);
    const expired = withPlayer(state, { ...(state.players[target.id] ?? target), contractUntil: addDays(state.date, -1) });
    const joined = advanceDay(expired, {});
    expect(joined.state.players[target.id]?.clubId).toBe(COACH);
    expect(joined.events).toContainEqual(expect.objectContaining({ type: "playerMoved", kind: "preContract", playerId: target.id, fee: 0 }));
  });
});

describe("free agents", () => {
  it("join for no fee, only a signing bonus and the agent's commission", () => {
    const free = { ...serieBStandout(windowEve) };
    const players = { ...windowEve.players };
    Reflect.deleteProperty(players, free.id);
    const before = rich({ ...windowEve, players, market: { ...windowEve.market, freeAgents: { ...windowEve.market.freeAgents, [free.id]: free } } });
    const { state, decision } = ask(before, { kind: "sign", playerId: free.id });
    expect(decision.approved).toBe(true);
    expect(state.players[free.id]?.clubId).toBe(COACH);
    expect(state.market.freeAgents[free.id]).toBeUndefined();
    const costs = (s: GameState) => financeOf(s, COACH).month.costs;
    expect(costs(state).transferFees).toBe(costs(before).transferFees);
    expect(costs(state).signingFees).toBeGreaterThan(costs(before).signingFees);
    expect(costs(state).agentFees).toBeGreaterThan(costs(before).agentFees);
  });
});

describe("loans", () => {
  it("send a young player to a lower division, the lender paying half his wage, and bring him back when they end", () => {
    const weakest = squadOf(windowEve, COACH).sort((a, b) => a.strength - b.strength)[0];
    if (!weakest) throw new Error("no Flamengo player");
    const youngster = { ...weakest, age: 19 };
    const { state, decision } = ask(withPlayer(windowEve, youngster), { kind: "loanOut", playerId: youngster.id });
    expect(decision.approved).toBe(true);
    const loan = state.market.loans[youngster.id];
    const borrower = state.players[youngster.id]?.clubId ?? "";
    expect(loan?.fromClubId).toBe(COACH);
    expect(state.clubs[borrower]?.division).not.toBe("A");
    const wage = state.players[youngster.id]?.wage ?? 0;
    const billWithout = (clubId: string) => squadOf(state, clubId).filter((p) => p.id !== youngster.id).reduce((sum, p) => sum + p.wage, 0);
    expect(wageBillsOf(state).get(borrower)).toBe(billWithout(borrower) + wage - Math.round(wage / 2));
    const ended = { ...state, market: { ...state.market, loans: { ...state.market.loans, [youngster.id]: { ...loan, fromClubId: COACH, until: addDays(state.date, -1), lenderWageShare: 0.5, buyOption: null } } } };
    const back = advanceDay(ended, {});
    expect(back.state.players[youngster.id]?.clubId).toBe(COACH);
    expect(back.state.market.loans[youngster.id]).toBeUndefined();
  });

  it("borrow a reserve from a bigger club with a purchase clause the coach can trigger", () => {
    const smallCoach = rich({ ...windowEve, coachClubId: "sport-pe" });
    const lender = Object.values(smallCoach.clubs).find((c) => c.division === "A" && c.id !== "sport-pe")?.id ?? "";
    const reserve = squadOf(smallCoach, lender).sort((a, b) => a.strength - b.strength)[0];
    if (!reserve) throw new Error("no reserve");
    const coachRich = withFinance(smallCoach, "sport-pe", { transferBudget: 1e10, wageCap: 1e10 });
    const isSerieB = coachRich.clubs["sport-pe"]?.division === "B";
    expect(isSerieB).toBe(true);
    const loaned = ask(coachRich, { kind: "loanIn", playerId: reserve.id });
    expect(loaned.decision).toMatchObject({ approved: true, reason: null });
    expect(loaned.state.market.loans[reserve.id]?.buyOption).toBeGreaterThan(0);
    const bought = ask(loaned.state, { kind: "sign", playerId: reserve.id });
    expect(bought.decision.approved).toBe(true);
    expect(bought.events).toContainEqual(expect.objectContaining({ type: "playerMoved", kind: "loanBuy", fromClubId: lender, toClubId: "sport-pe" }));
    expect(bought.state.market.loans[reserve.id]).toBeUndefined();
  });
});

describe("a save with the transfer market", () => {
  it("round-trips loans, free agents and pre-contracts exactly", () => {
    let busy = windowEve;
    while (busy.date < "2026-01-13") busy = advanceDay(busy, {}).state;
    expect(Object.keys(busy.market.loans).length).toBeGreaterThan(0);
    expect(loadGame(saveGame(busy))).toStrictEqual(busy);
  });
});
