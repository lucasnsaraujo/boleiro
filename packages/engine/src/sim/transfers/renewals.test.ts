import { describe, expect, it } from "vitest";
import { addDays } from "../dates.js";
import type { ClubFinance, GameState, SimPlayer } from "../gameState.js";
import { EMPTY_MEMORY } from "../events/eventMemory.js";
import { loadNewGame } from "../loadNewGame.js";
import { coachMarketOf, withCoachMarket, withRenewalCounter } from "./coachMarket.js";
import { assistantPick, contractEndAfter, lengthPremium, type ContractTerm } from "./contractTerms.js";
import { decideCoachRequest as decideOnLiveState } from "./decideCoachRequest.js";
import { openDraft } from "./movePlayer.js";
import { releaseClauseOf } from "./releaseClause.js";
import { renewalTermsOf, talkMoodOf } from "./renewalTerms.js";
import { runTransferDay } from "./runTransferDay.js";
import { wageBillsOf } from "./wageBillsOf.js";
import { willingToJoin } from "./willingToJoin.js";

const COACH = "flamengo-rj";
const start = loadNewGame(4, { coachClubId: COACH });
const financeOf = (state: GameState): ClubFinance => {
  const finance = state.finances[COACH];
  if (!finance) throw new Error("no finances for the coach's club");
  return finance;
};
const withFinance = (state: GameState, patch: Partial<ClubFinance>): GameState => ({ ...state, finances: { ...state.finances, [COACH]: { ...financeOf(state), ...patch } } });
const rich = withFinance(start, { transferBudget: 1e10, wageCap: 1e10 });
const [ours] = Object.values(start.players)
  .filter((p) => p.clubId === COACH)
  .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
if (!ours) throw new Error("no Flamengo player");
const withPlayer = (state: GameState, patch: Partial<SimPlayer>): GameState => ({ ...state, players: { ...state.players, [ours.id]: { ...ours, ...patch } } });
const termOf = (state: GameState, months: number): ContractTerm => {
  const player = state.players[ours.id];
  const term = player && renewalTermsOf(state, player).terms.find((t) => t.months === months);
  if (!term) throw new Error(`no ${months}-month term`);
  return term;
};
// The market day hands the decision a draft it may edit in place (runTransferDay).
const decideCoachRequest: typeof decideOnLiveState = (state, request, random) => decideOnLiveState(openDraft(state), request, random);
const yes = () => 0;
const no = () => 0.99;

describe("a renewal the coach asks for", () => {
  it("extends the contract by the length chosen, from its old end, at the wage offered", () => {
    const player = rich.players[ours.id];
    const pick = player && assistantPick(renewalTermsOf(rich, player).terms);
    if (!pick) throw new Error("he agrees to no length");
    const { state, events } = decideCoachRequest(rich, { kind: "renew", playerId: ours.id, years: pick.months / 12, wage: pick.wage }, no);
    expect(events[0]).toMatchObject({ type: "requestDecided", approved: true });
    expect(state.players[ours.id]).toMatchObject({ contractUntil: contractEndAfter(ours.contractUntil, pick.months), wage: pick.wage });
    expect(events).toContainEqual({ type: "playerContractRenewed", playerId: ours.id, clubId: COACH, until: contractEndAfter(ours.contractUntil, pick.months), wage: pick.wage });
  });

  it("runs six months to the next 30 June for a young player who agrees to it", () => {
    const young = withPlayer(rich, { age: 21, contractUntil: "2026-12-31" });
    const { state, events } = decideCoachRequest(young, { kind: "renew", playerId: ours.id, years: 0.5 }, no);
    expect(events[0]).toMatchObject({ approved: true });
    expect(state.players[ours.id]?.contractUntil).toBe("2027-06-30");
    expect(state.players[ours.id]?.wage).toBe(termOf(young, 6).wage);
  });

  it("is refused for a length he won't talk about", () => {
    const veteran = withPlayer(rich, { age: 31 });
    expect(termOf(veteran, 6).stance).toBe("refuses");
    const { state, events } = decideCoachRequest(veteran, { kind: "renew", playerId: ours.id, years: 0.5 }, yes);
    expect(events).toEqual([{ type: "requestDecided", request: { kind: "renew", playerId: ours.id, years: 0.5 }, approved: false, reason: "lengthRefused" }]);
    expect(state.players[ours.id]).toEqual(veteran.players[ours.id]);
  });

  it("gets his counter when the wage offered is a little under his ask, and the counter signs", () => {
    const veteran = withPlayer(rich, { age: 31 });
    const { wage } = termOf(veteran, 24);
    const countered = decideCoachRequest(veteran, { kind: "renew", playerId: ours.id, years: 2, wage: Math.round(wage * 0.9) }, no);
    expect(countered.events).toContainEqual(expect.objectContaining({ type: "requestDecided", approved: false, reason: "playerCounter" }));
    expect(countered.events).toContainEqual({ type: "renewalCountered", playerId: ours.id, months: 24, wage });
    expect(coachMarketOf(countered.state).renewalCounters?.[ours.id]).toMatchObject({ months: 24, wage });
    const signed = decideCoachRequest(countered.state, { kind: "renew", playerId: ours.id, years: 2, wage }, no);
    expect(signed.events[0]).toMatchObject({ approved: true });
    expect(signed.state.players[ours.id]?.wage).toBe(wage);
    expect(coachMarketOf(signed.state).renewalCounters?.[ours.id]).toBeUndefined();
  });

  it("drops his counter once his contract changes before the coach takes it up", () => {
    const veteran = withPlayer(rich, { age: 31 });
    const hard = termOf(veteran, 12);
    const countered = decideCoachRequest(veteran, { kind: "renew", playerId: ours.id, years: 1, wage: Math.round(hard.wage * 0.9) }, no);
    expect(countered.events).toContainEqual({ type: "renewalCountered", playerId: ours.id, months: 12, wage: hard.wage });
    const accept = { kind: "renew", playerId: ours.id, years: 1, wage: hard.wage } as const;
    expect(decideCoachRequest(countered.state, accept, no).events[0]).toMatchObject({ approved: true });
    const extended = withPlayer(countered.state, { age: 31, contractUntil: "2028-12-31" });
    expect(decideCoachRequest(extended, accept, no).events[0]).toMatchObject({ approved: false, reason: "playerUnwilling" });
  });

  it("is answered before his contract runs out when sent on its last day", () => {
    const lastDay = withPlayer(rich, { contractUntil: "2026-12-31" });
    const morning = { ...lastDay, date: "2027-01-01" };
    const { state, events } = runTransferDay(morning, [{ kind: "renew", playerId: ours.id, years: 2 }]);
    expect(events).toContainEqual(expect.objectContaining({ type: "requestDecided", approved: true }));
    expect(state.players[ours.id]).toMatchObject({ clubId: COACH, contractUntil: "2028-12-31" });
  });

  it("signs his counter when the coach takes it up on the last day it stands", () => {
    const veteran = withPlayer(rich, { age: 31 });
    const hard = termOf(veteran, 12);
    const counter = { months: 12, wage: hard.wage, until: veteran.date, contractUntil: ours.contractUntil };
    const lastDay = withCoachMarket(veteran, withRenewalCounter(coachMarketOf(veteran), ours.id, counter));
    const { events } = runTransferDay({ ...lastDay, date: addDays(veteran.date, 1) }, [{ kind: "renew", playerId: ours.id, years: 1, wage: hard.wage }]);
    expect(events).toContainEqual(expect.objectContaining({ type: "requestDecided", approved: true }));
  });

  it("is refused outright when the wage offered is far below his ask", () => {
    const { wage } = termOf(rich, 24);
    const { events } = decideCoachRequest(rich, { kind: "renew", playerId: ours.id, years: 2, wage: Math.round(wage / 2) }, yes);
    expect(events[0]).toMatchObject({ approved: false, reason: "wageTooLow" });
  });

  it("signs a length he finds hard only on a good draw, and only for his full ask", () => {
    const veteran = withPlayer(rich, { age: 31 });
    const hard = termOf(veteran, 12);
    expect(hard.stance).toBe("hard");
    const request = { kind: "renew", playerId: ours.id, years: 1 } as const;
    expect(decideCoachRequest(veteran, request, yes).events[0]).toMatchObject({ approved: true });
    expect(decideCoachRequest(veteran, request, no).events[0]).toMatchObject({ approved: false, reason: "playerUnwilling" });
    expect(decideCoachRequest(veteran, { ...request, wage: hard.wage - 1 }, yes).events[0]).toMatchObject({ approved: false, reason: "playerCounter" });
  });

  it("is refused by the board when the raise takes the bill past the wage cap", () => {
    const capped = withFinance(withPlayer(start, { wage: 1 }), { wageCap: wageBillsOf(withPlayer(start, { wage: 1 })).get(COACH) ?? 0 });
    expect(decideCoachRequest(capped, { kind: "renew", playerId: ours.id, years: 2 }, yes).events[0]).toMatchObject({ approved: false, reason: "wageCap" });
  });

  it("never runs past the half-season end five years after the day it is signed (Lei 14.597/2023 art. 86)", () => {
    const october = { ...withPlayer(rich, { age: 31, contractUntil: "2027-12-31" }), date: "2026-10-18" };
    const { state } = decideCoachRequest(october, { kind: "renew", playerId: ours.id, years: 5 }, yes);
    expect(state.players[ours.id]?.contractUntil).toBe("2031-06-30");
  });

  it("sets his release clause from the new contract: a raise lifts the legal cap on it", () => {
    const lowPaid = withPlayer(rich, { wage: 1_000 });
    const before = releaseClauseOf({ ...ours, wage: 1_000 }, "A", lowPaid.market.eurBrl);
    const { state } = decideCoachRequest(lowPaid, { kind: "renew", playerId: ours.id, years: 2, wage: termOf(lowPaid, 24).wage }, yes);
    const renewed = state.players[ours.id];
    if (!renewed) throw new Error("he left");
    expect(before).toBe(2_000 * 1_000);
    expect(releaseClauseOf(renewed, "A", state.market.eurBrl)).toBeGreaterThan(before);
  });
});

describe("a player's renewal counter on the market's day", () => {
  const counter = { months: 24, wage: 1, until: "2026-03-25", contractUntil: ours.contractUntil };
  const day = { ...start, date: "2026-03-20" };
  const withCounter = (state: GameState): GameState => withCoachMarket(state, { ...coachMarketOf(state), renewalCounters: { [ours.id]: counter } });

  it("outlives a club's offer for him that lapses", () => {
    const bid = { playerId: ours.id, buyerId: "palmeiras-sp", fee: 1, feeEur: null, ceiling: 1, isFinal: false, madeOn: "2026-03-17", until: "2026-03-19" };
    const offered = withCounter(withCoachMarket(day, { ...coachMarketOf(day), bids: { [ours.id]: bid } }));
    const coach = coachMarketOf(runTransferDay(offered, []).state);
    expect(coach.bids[ours.id]).toBeUndefined();
    expect(coach.renewalCounters?.[ours.id]).toEqual(counter);
  });

  it("goes once it lapses or he leaves the club", () => {
    expect(coachMarketOf(runTransferDay({ ...withCounter(day), date: "2026-03-26" }, []).state)).not.toHaveProperty("renewalCounters");
    const gone = withPlayer(withCounter(day), { clubId: "palmeiras-sp" });
    expect(coachMarketOf(runTransferDay(gone, []).state)).not.toHaveProperty("renewalCounters");
  });
});

describe("renewalTermsOf", () => {
  it("never asks less than he earns, however happy the squad", () => {
    const happy: GameState = { ...withPlayer(start, { wage: 50_000_000 }), mood: { ...start.mood, [COACH]: { squad: 100, fans: 50, supporters: "calm", closedDoorGames: 0 } } };
    const player = happy.players[ours.id];
    if (!player) throw new Error("he left");
    expect(Math.min(...renewalTermsOf(happy, player).terms.map((t) => t.wage))).toBe(50_000_000);
  });
});

describe("talkMoodOf", () => {
  it("remembers a request to leave for a year, and sees a club's offer waiting", () => {
    const asked: GameState = { ...start, eventMemory: { ...EMPTY_MEMORY, log: [{ typeId: "player-wants-out", date: "2025-11-01", clubId: COACH, playerId: ours.id }] } };
    expect(talkMoodOf(asked, ours).hasAskedToLeave).toBe(true);
    expect(talkMoodOf({ ...asked, date: "2026-11-02" }, ours).hasAskedToLeave).toBe(false);
    const coach = coachMarketOf(start);
    const bid = { playerId: ours.id, buyerId: "palmeiras-sp", fee: 1, feeEur: null, ceiling: 1, isFinal: false, madeOn: start.date, until: start.date };
    expect(talkMoodOf(withCoachMarket(start, { ...coach, bids: { [ours.id]: bid } }), ours).offerFrom).toBe("palmeiras-sp");
  });
});

describe("a signing with a contract length", () => {
  const [best] = Object.values(start.players)
    .filter((p) => p.clubId === "santos-sp")
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  if (!best) throw new Error("no Santos player");
  const freeAgent = (patch: Partial<SimPlayer>): GameState => {
    const players = { ...rich.players };
    Reflect.deleteProperty(players, best.id);
    return { ...rich, players, market: { ...rich.market, freeAgents: { ...rich.market.freeAgents, [best.id]: { ...best, ...patch } } } };
  };

  it("runs his contract to the half-season end nearest the length chosen", () => {
    const { state } = decideCoachRequest(freeAgent({ age: 27 }), { kind: "sign", playerId: best.id, wage: best.wage * 3, years: 2 }, yes);
    expect(state.players[best.id]).toMatchObject({ clubId: COACH, contractUntil: contractEndAfter(start.date, 24), wage: best.wage * 3 });
  });

  it("runs at most to the half-season end five years after the day he signs", () => {
    const { state } = decideCoachRequest({ ...freeAgent({ age: 32 }), date: "2026-10-18" }, { kind: "sign", playerId: best.id, wage: best.wage * 3, years: 5 }, yes);
    expect(state.players[best.id]?.contractUntil).toBe("2031-06-30");
  });

  it("is refused for a length he won't talk about", () => {
    const { events } = decideCoachRequest(freeAgent({ age: 32 }), { kind: "sign", playerId: best.id, wage: best.wage * 3, years: 0.5 }, yes);
    expect(events[0]).toMatchObject({ approved: false, reason: "lengthRefused" });
  });

  it("weighs a length off the one he wants like a smaller wage", () => {
    const veteran = freeAgent({ age: 32 });
    const chance = (wage: number) => willingToJoin({ player: { ...best, age: 32 }, from: "A", to: { tier: "A", fanbase: start.clubs[COACH]?.fanbase ?? 0 }, wage, unemployed: true });
    const between = (chance(best.wage) + chance(best.wage / (1 + lengthPremium(12, 36)))) / 2;
    const atWish = decideCoachRequest(veteran, { kind: "sign", playerId: best.id, wage: best.wage, years: 3 }, () => between);
    const offWish = decideCoachRequest(veteran, { kind: "sign", playerId: best.id, wage: best.wage, years: 1 }, () => between);
    expect(atWish.events[0]).toMatchObject({ approved: true });
    expect(offWish.events[0]).toMatchObject({ approved: false, reason: "playerUnwilling" });
  });
});
