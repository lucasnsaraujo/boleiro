import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { addDays } from "../dates.js";
import { tierOf } from "../finances/tierOf.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { answerBid } from "./answerBid.js";
import { sellerPrice } from "./askingPrice.js";
import { coachMarketOf, withCoachMarket } from "./coachMarket.js";
import type { CoachRequest } from "./coachRequest.js";
import { europeBids } from "./europeBids.js";
import { listPlayer } from "./listPlayer.js";
import { SQUAD_CAP } from "./squadCap.js";
import type { Bid } from "./transferMarket.js";
import { valuePlayer } from "./valuePlayer.js";

const COACH = "flamengo-rj";
const BUYER = "bahia-ba";
let windowOpen = loadNewGame(4, { coachClubId: COACH });
while (windowOpen.date < "2026-01-06") windowOpen = advanceDay(windowOpen, {}).state;

const squadOf = (state: GameState, clubId: string) => Object.values(state.players).filter((p) => p.clubId === clubId).sort((a, b) => a.id.localeCompare(b.id));
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
const rich = (state: GameState, clubId = COACH) => withFinance(state, clubId, { transferBudget: 1e10, wageCap: 1e10 });
const ours = squadOf(windowOpen, COACH);
const weakestFirst = [...ours].sort((a, b) => a.strength - b.strength || a.id.localeCompare(b.id));
const median = weakestFirst[ours.length >> 1];
if (!median) throw new Error("no Flamengo player");

function withBid(state: GameState, bid: Partial<Bid> & { playerId: string }): GameState {
  const coach = coachMarketOf(state);
  const full: Bid = { buyerId: BUYER, fee: 10_000_000, feeEur: null, ceiling: 12_000_000, isFinal: false, madeOn: state.date, until: addDays(state.date, 2), ...bid };
  return withCoachMarket(state, { ...coach, bids: { ...coach.bids, [bid.playerId]: full } });
}

/** Plays `days` days and gathers their events. */
function play(state: GameState, days: number, requests: readonly CoachRequest[] = []): { state: GameState; events: DayEvent[] } {
  let next = state;
  const events: DayEvent[] = [];
  for (let day = 0; day < days; day++) {
    const done = advanceDay(next, day === 0 && requests.length ? { requests } : {});
    next = done.state;
    events.push(...done.events);
  }
  return { state: next, events };
}

const bidsIn = (events: readonly DayEvent[]) => events.flatMap((e) => (e.type === "bidReceived" ? [e] : []));

describe("listing a player for sale", () => {
  it("asks less than his value in the cheap mode and more in the expensive one", () => {
    const value = valuePlayer(median, tierOf({ division: "A" }), windowOpen.date) * windowOpen.market.eurBrl;
    const cheap = coachMarketOf(listPlayer(windowOpen, median.id, "cheap")).listings[median.id];
    const expensive = coachMarketOf(listPlayer(windowOpen, median.id, "expensive")).listings[median.id];
    expect(cheap?.price).toBeLessThan(value);
    expect(expensive?.price).toBeGreaterThan(value);
  });

  it("is only for the coach's own players", () => {
    const other = squadOf(windowOpen, BUYER)[0];
    expect(() => listPlayer(windowOpen, other?.id ?? "", "cheap")).toThrow();
  });

  it("draws an offer at the asking price that waits for the coach's answer", () => {
    let listed = windowOpen;
    for (const player of weakestFirst.slice(0, 6)) listed = listPlayer(listed, player.id, "cheap");
    const { state, events } = play(listed, 12);
    const [first] = bidsIn(events);
    expect(first).toBeDefined();
    const listedPrice = coachMarketOf(listed).listings[first?.playerId ?? ""]?.price;
    expect(first?.fee).toBe(listedPrice);
    expect(events.some((e) => e.type === "playerMoved" && e.playerId === first?.playerId)).toBe(false);
    expect(Object.values(coachMarketOf(state).bids).every((bid) => state.players[bid.playerId]?.clubId === COACH)).toBe(true);
  });

  it("finds buyers sooner in the cheap mode than in the expensive one", () => {
    const listAll = (mode: "cheap" | "expensive") => weakestFirst.slice(0, 10).reduce((state, player) => listPlayer(state, player.id, mode), windowOpen);
    const cheapBids = bidsIn(play(listAll("cheap"), 14).events).length;
    const expensiveBids = bidsIn(play(listAll("expensive"), 14).events).length;
    expect(cheapBids).toBeGreaterThan(expensiveBids);
  });

  it("keeps a club's waiting offer when the coach changes the price or takes him off, but not when he goes to auction", () => {
    const offered = withBid(listPlayer(windowOpen, median.id, "cheap"), { playerId: median.id });
    expect(coachMarketOf(listPlayer(offered, median.id, "expensive")).bids[median.id]).toBeDefined();
    expect(coachMarketOf(listPlayer(offered, median.id, null)).bids[median.id]).toBeDefined();
    expect(coachMarketOf(listPlayer(offered, median.id, "auction")).bids[median.id]).toBeUndefined();
  });

  it("survives a save and a load", () => {
    const listed = listPlayer(windowOpen, median.id, "expensive");
    expect(coachMarketOf(loadGame(saveGame(listed))).listings[median.id]).toEqual(coachMarketOf(listed).listings[median.id]);
  });
});

describe("answering a club's offer", () => {
  const offered = withBid(rich(windowOpen, BUYER), { playerId: median.id });

  it("sells him to the bidder for the fee when the coach accepts, and both clubs book it", () => {
    const { state, outcome } = answerBid(offered, median.id, { kind: "accept" });
    expect(outcome).toBe("sold");
    expect(state.players[median.id]?.clubId).toBe(BUYER);
    expect(financeOf(state, COACH).month.revenue.playerSales - financeOf(offered, COACH).month.revenue.playerSales).toBe(10_000_000);
    expect(financeOf(state, BUYER).month.costs.transferFees - financeOf(offered, BUYER).month.costs.transferFees).toBe(10_000_000);
    expect(coachMarketOf(state).bids[median.id]).toBeUndefined();
  });

  it("keeps him and drops the offer when the coach turns it down", () => {
    const { state, outcome } = answerBid(offered, median.id, { kind: "decline" });
    expect(outcome).toBe("declined");
    expect(state.players[median.id]?.clubId).toBe(COACH);
    expect(coachMarketOf(state).bids[median.id]).toBeUndefined();
  });

  it("sells him at a counter-offer the buyer can reach", () => {
    const { state, outcome } = answerBid(offered, median.id, { kind: "counter", fee: 11_500_000 });
    expect(outcome).toBe("sold");
    expect(financeOf(state, COACH).month.revenue.playerSales - financeOf(offered, COACH).month.revenue.playerSales).toBe(11_500_000);
  });

  it("gets the buyer's last word at its highest price for a counter above it, which can be taken but not countered", () => {
    const { state, outcome } = answerBid(offered, median.id, { kind: "counter", fee: 13_000_000 });
    expect(outcome).toBe("finalOffer");
    expect(coachMarketOf(state).bids[median.id]).toMatchObject({ fee: 12_000_000, isFinal: true });
    expect(state.players[median.id]?.clubId).toBe(COACH);
    expect(() => answerBid(state, median.id, { kind: "counter", fee: 13_000_000 })).toThrow();
    expect(answerBid(state, median.id, { kind: "accept" }).state.players[median.id]?.clubId).toBe(BUYER);
  });

  it("sees the buyer walk away from a counter far above what it would pay", () => {
    const { state, outcome } = answerBid(offered, median.id, { kind: "counter", fee: 20_000_000 });
    expect(outcome).toBe("walkedAway");
    expect(state.players[median.id]?.clubId).toBe(COACH);
  });

  it("sees the buyer walk away from a counter when it had already offered all it would", () => {
    const capped = withBid(windowOpen, { playerId: median.id, fee: 10_000_000, ceiling: 10_000_000 });
    const { state, outcome } = answerBid(capped, median.id, { kind: "counter", fee: 15_000_000 });
    expect(outcome).toBe("walkedAway");
    expect(coachMarketOf(state).bids[median.id]).toBeUndefined();
  });

  it("lapses when the coach lets the deadline pass, and he stays", () => {
    const lapsing = withBid(windowOpen, { playerId: median.id, until: windowOpen.date });
    const { state } = play(lapsing, 2);
    expect(coachMarketOf(state).bids[median.id]).toBeUndefined();
    expect(state.players[median.id]?.clubId).toBe(COACH);
  });
});

describe("Europe's bids", () => {
  const standout = { ...median, strength: 88, age: 20, condition: { ...median.condition, arrivedOn: null } };
  const rival = squadOf(windowOpen, BUYER).find((p) => !windowOpen.market.loans[p.id]);
  if (!rival) throw new Error("no Bahia player");
  const twin = { ...rival, strength: 88, age: 20, condition: { ...rival.condition, arrivedOn: null } };
  const before = withPlayer(withPlayer(windowOpen, standout), twin);
  const { state, events } = europeBids(before, () => 0);

  it("wait for the coach's answer for his players instead of selling them", () => {
    expect(state.players[standout.id]?.clubId).toBe(COACH);
    expect(coachMarketOf(state).bids[standout.id]).toMatchObject({ buyerId: null, isFinal: false });
    expect(events).toContainEqual(expect.objectContaining({ type: "bidReceived", playerId: standout.id, buyerId: null }));
  });

  it("are still taken by AI boards on the spot", () => {
    expect(state.players[twin.id]).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({ type: "europeBid", playerId: twin.id, accepted: true }));
  });

  it("sell him abroad when the coach accepts", () => {
    const sold = answerBid(state, standout.id, { kind: "accept" });
    expect(sold.state.players[standout.id]).toBeUndefined();
    expect(sold.events).toContainEqual(expect.objectContaining({ type: "playerMoved", kind: "abroad", playerId: standout.id, toClubId: null }));
  });
});

describe("an auction", () => {
  it("draws bids from clubs while it runs", () => {
    let auctioned = windowOpen;
    for (const player of weakestFirst.slice(0, 8)) auctioned = listPlayer(auctioned, player.id, "auction");
    const { state } = play(auctioned, 3);
    const bids = Object.values(coachMarketOf(state).auctions).flatMap((auction) => auction.bids);
    expect(bids.length).toBeGreaterThan(0);
  });

  it("sells him to the best bid when it closes", () => {
    const auctioned = listPlayer(rich(windowOpen, BUYER), median.id, "auction");
    const auction = coachMarketOf(auctioned).auctions[median.id];
    if (!auction) throw new Error("no auction");
    const best = auction.minBid + 2_000_000;
    const coach = coachMarketOf(auctioned);
    const bids = [
      { clubId: "vasco-da-gama-rj", fee: auction.minBid, date: auctioned.date },
      { clubId: BUYER, fee: best, date: auctioned.date },
    ];
    const withBids = withCoachMarket(auctioned, { ...coach, auctions: { [median.id]: { ...auction, closesOn: auctioned.date, bids } } });
    const { state, events } = play(withBids, 1);
    expect(state.players[median.id]?.clubId).toBe(BUYER);
    expect(events).toContainEqual(expect.objectContaining({ type: "playerMoved", playerId: median.id, fee: best }));
    expect(events).toContainEqual({ type: "auctionClosed", playerId: median.id, sold: true });
  });

  it("keeps him when the coach takes him off it", () => {
    const auctioned = listPlayer(windowOpen, median.id, "auction");
    const withdrawn = listPlayer(auctioned, median.id, null);
    expect(coachMarketOf(withdrawn).auctions[median.id]).toBeUndefined();
    expect(play(withdrawn, 6).state.players[median.id]?.clubId).toBe(COACH);
  });

  it("needs the window open, and sells inside it", () => {
    expect(() => listPlayer({ ...windowOpen, date: "2026-04-10" }, median.id, "auction")).toThrow();
    expect(() => listPlayer({ ...windowOpen, date: "2026-03-02" }, median.id, "auction")).toThrow();
    const late = listPlayer({ ...windowOpen, date: "2026-02-28" }, median.id, "auction");
    expect(coachMarketOf(late).auctions[median.id]?.closesOn).toBe("2026-03-02");
  });
});

describe("the coach's offer for another club's player", () => {
  const target = squadOf(windowOpen, "vitoria-ba").sort((a, b) => b.strength - a.strength)[0];
  if (!target) throw new Error("no Vitória player");
  const seller = squadOf(windowOpen, "vitoria-ba");
  const price = sellerPrice(target, seller, tierOf({ division: "A" }), addDays(windowOpen.date, 1), windowOpen.market.eurBrl);
  const decisionOf = (events: readonly DayEvent[]) => events.find((e) => e.type === "requestDecided");

  it("gets a counter-offer at the club's price when it is below it", () => {
    const { state, events } = play(rich(windowOpen), 1, [{ kind: "sign", playerId: target.id, fee: Math.round(price * 0.8) }]);
    expect(decisionOf(events)).toMatchObject({ approved: false, reason: "counterOffer" });
    expect(events).toContainEqual({ type: "counterOffered", playerId: target.id, clubId: "vitoria-ba", fee: price });
    expect(coachMarketOf(state).counters[target.id]).toMatchObject({ clubId: "vitoria-ba", fee: price });
    expect(state.players[target.id]?.clubId).toBe("vitoria-ba");
  });

  it("gets past the club once he offers the counter's price", () => {
    const countered = play(rich(windowOpen), 1, [{ kind: "sign", playerId: target.id, fee: Math.round(price * 0.8) }]).state;
    const counter = coachMarketOf(countered).counters[target.id];
    const { events } = play(countered, 1, [{ kind: "sign", playerId: target.id, fee: counter?.fee ?? 0 }]);
    const decision = decisionOf(events);
    expect(decision?.type === "requestDecided" && decision.reason).not.toBe("counterOffer");
    expect(decision?.type === "requestDecided" && decision.reason).not.toBe("offerTooLow");
  });

  it("can take up the club's counter on the last day it stands", () => {
    const coach = coachMarketOf(windowOpen);
    const fee = Math.round(price * 0.9);
    const lastDay = withCoachMarket(rich(windowOpen), { ...coach, counters: { [target.id]: { clubId: "vitoria-ba", fee, until: windowOpen.date } } });
    const decision = decisionOf(play(lastDay, 1, [{ kind: "sign", playerId: target.id, fee }]).events);
    expect(decision?.type === "requestDecided" && decision.reason).not.toBe("counterOffer");
  });

  it("is refused outright when it is far below the club's price", () => {
    const { state, events } = play(rich(windowOpen), 1, [{ kind: "sign", playerId: target.id, fee: Math.round(price * 0.3) }]);
    expect(decisionOf(events)).toMatchObject({ approved: false, reason: "offerTooLow" });
    expect(coachMarketOf(state).counters[target.id]).toBeUndefined();
  });
});

describe(`the ${SQUAD_CAP}-player cap`, () => {
  const target = squadOf(windowOpen, "vitoria-ba")[0];
  if (!target || !median) throw new Error("no players");
  let full = rich(windowOpen);
  for (let i = squadOf(full, COACH).length; i < SQUAD_CAP; i++) full = withPlayer(full, { ...median, id: `filler-${i}` });

  it("makes the board refuse a signing while the squad is full", () => {
    const { events } = play(full, 1, [{ kind: "sign", playerId: target.id }]);
    expect(events.find((e) => e.type === "requestDecided")).toMatchObject({ approved: false, reason: "squadFull" });
  });

  it("counts players with a pre-contract here, who join when their contracts end", () => {
    const below = { ...full, players: Object.fromEntries(Object.entries(full.players).filter(([id]) => id !== `filler-${SQUAD_CAP - 1}`)) };
    const joining = { ...below, market: { ...below.market, preContracts: { ...below.market.preContracts, [target.id]: COACH } } };
    const other = squadOf(windowOpen, "vitoria-ba")[1];
    const { events } = play(joining, 1, [{ kind: "sign", playerId: other?.id ?? "" }]);
    expect(events.find((e) => e.type === "requestDecided")).toMatchObject({ approved: false, reason: "squadFull" });
  });

  it("lets the board sign again once a player leaves", () => {
    const below = { ...full, players: Object.fromEntries(Object.entries(full.players).filter(([id]) => id !== `filler-${SQUAD_CAP - 1}`)) };
    const { events } = play(below, 1, [{ kind: "sign", playerId: target.id }]);
    expect(events.find((e) => e.type === "requestDecided")).not.toMatchObject({ reason: "squadFull" });
  });

  it("keeps a full club from buying the coach's player even after he accepts its offer", () => {
    let fullBuyer = windowOpen;
    for (let i = squadOf(windowOpen, BUYER).length; i < SQUAD_CAP; i++) fullBuyer = withPlayer(fullBuyer, { ...median, clubId: BUYER, id: `buyer-filler-${i}` });
    const offered = withBid(fullBuyer, { playerId: median.id, buyerId: BUYER });
    const { state, outcome } = answerBid(offered, median.id, { kind: "accept" });
    expect(outcome).toBe("walkedAway");
    expect(state.players[median.id]?.clubId).toBe(COACH);
  });
});
