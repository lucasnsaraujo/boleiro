import { describe, expect, it } from "vitest";
import { advanceDay } from "../advanceDay.js";
import { nameCaptain } from "../chemistry/nameCaptain.js";
import { assistantTicketPrice, doesAssistantPriceTickets, setTicketPrice, withAssistantPricing } from "../finances/setTicketPrice.js";
import type { GameState, SimPlayer } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { isInjured } from "../players/isInjured.js";
import { withCoachMarket, coachMarketOf } from "../transfers/coachMarket.js";
import { runTransferDay } from "../transfers/runTransferDay.js";
import type { Bid } from "../transfers/transferMarket.js";
import { assistantPromotions } from "../youth/assistantPromotions.js";
import { ASSISTANT_DUTIES, doesAssistantHandle, withAssistantDuty, type AssistantDuty } from "./assistantDuties.js";
import { swapSeat } from "./humanCoaches.js";

const COACH = "flamengo-rj";
const start = loadNewGame(5, { coachClubId: COACH });
const squad = Object.values(start.players).filter((p) => p.clubId === COACH);
const fixture = start.fixtures.find((f) => f.homeId === COACH || f.awayId === COACH);
if (!fixture) throw new Error("Flamengo has no match");
const matchDay: GameState = { ...start, date: fixture.date };

const withDuty = (state: GameState, duty: AssistantDuty, isOn: boolean): GameState => ({ ...state, coach: withAssistantDuty(state.coach, duty, isOn) });

describe("the assistant's duties", () => {
  it("runs the lineup, the contracts and the ticket price by default, and leaves the youth and the sales to the coach", () => {
    const defaults = Object.fromEntries(ASSISTANT_DUTIES.map((duty) => [duty, doesAssistantHandle(start.coach, duty)]));
    expect(defaults).toEqual({ lineup: true, contracts: true, youth: false, ticketPrice: true, selling: false });
  });
});

describe("the lineup duty", () => {
  // The coach's own eleven of his last match: the weakest fit keeper and the ten weakest fit outfield players.
  const fit = squad.filter((p) => !isInjured(p, matchDay.date)).sort((a, b) => a.strength - b.strength);
  const keeper = fit.find((p) => p.group === "GK");
  if (!keeper) throw new Error("Flamengo has no fit keeper");
  const own = [keeper, ...fit.filter((p) => p.group !== "GK").slice(0, 10)].map((p) => p.id);
  const lastEleven = (state: GameState): GameState => ({ ...state, chemistry: { ...state.chemistry, [COACH]: { eleven: own, settled: 0, steadyGames: 0, kept: 11, was: 50 } } });
  const startersAfter = (state: GameState) => [...(advanceDay(state, {}).state.chemistry?.[COACH]?.eleven ?? [])].sort();

  it("switched off, keeps the coach's last eleven when he leaves the lineup to the game", () => {
    expect(startersAfter(withDuty(lastEleven(matchDay), "lineup", false))).toEqual([...own].sort());
  });

  it("switched on, has the assistant pick the day's best eleven instead", () => {
    expect(startersAfter(lastEleven(matchDay))).not.toEqual([...own].sort());
  });
});

describe("the ticket price duty", () => {
  it("holds while the club's price is the assistant's, and the coach's own price takes it over", () => {
    expect(doesAssistantPriceTickets(start)).toBe(true);
    const dearer = setTicketPrice(start, assistantTicketPrice(start, COACH) + 20);
    expect(doesAssistantPriceTickets(dearer)).toBe(false);
    expect(doesAssistantPriceTickets(withAssistantPricing(start, false))).toBe(false);
  });

  it("handed back to the assistant, sets the price back to his", () => {
    const handedBack = withAssistantPricing(setTicketPrice(start, assistantTicketPrice(start, COACH) + 20), true);
    expect(doesAssistantPriceTickets(handedBack)).toBe(true);
    expect(handedBack.finances[COACH]?.ticketPrice).toBe(assistantTicketPrice(start, COACH));
  });
});

describe("the youth duty", () => {
  const prospect = Object.values(start.youth?.prospects ?? {}).find((p) => p.clubId === COACH);
  if (!prospect || !start.youth) throw new Error("Flamengo has no academy");
  // A kid already as good as the squad's best, on the first day of the January window, a market day.
  const ready: GameState = { ...start, date: "2026-01-05", youth: { ...start.youth, prospects: { ...start.youth.prospects, [prospect.id]: { ...prospect, strength: 95 } } } };

  it("switched on, promotes a kid ready for the squad on a market day", () => {
    const done = assistantPromotions(withDuty(ready, "youth", true));
    expect(done.events).toContainEqual({ type: "youthPromoted", playerId: prospect.id, clubId: COACH, byAssistant: true });
    expect(done.state.players[prospect.id]?.clubId).toBe(COACH);
  });

  it("switched off, leaves the kid in the academy", () => {
    expect(assistantPromotions(ready).events).toEqual([]);
  });
});

describe("the selling duty", () => {
  const ranked = [...squad].sort((a, b) => b.strength - a.strength);
  const [star] = ranked;
  const surplus = ranked.at(-1);
  if (!star || !surplus) throw new Error("Flamengo has no players");
  const bidFor = (player: SimPlayer): Bid => ({ playerId: player.id, buyerId: "palmeiras-sp", fee: 1_000_000, feeEur: null, ceiling: 1_200_000, isFinal: false, madeOn: "2026-01-06", until: "2026-01-08" });
  // The weakest player, at 35, is past the age the club keeps players to.
  const offered = (state: GameState): GameState => {
    const coach = coachMarketOf(state);
    const players = { ...state.players, [surplus.id]: { ...surplus, age: 35 } };
    return withCoachMarket({ ...state, players, date: "2026-01-07" }, { ...coach, bids: { [star.id]: bidFor(star), [surplus.id]: bidFor(surplus) } });
  };

  it("switched on, sells a player outside the plans for the most the buyer would pay and leaves the offer for a key player to the coach", () => {
    const day = runTransferDay(withDuty(offered(start), "selling", true), []);
    expect(day.state.players[surplus.id]?.clubId).toBe("palmeiras-sp");
    expect(day.events).toContainEqual(expect.objectContaining({ type: "playerMoved", playerId: surplus.id, toClubId: "palmeiras-sp", fee: 1_200_000, byAssistant: true }));
    expect(coachMarketOf(day.state).bids[star.id]).toBeDefined();
  });

  it("switched on, leaves to the coach an offer for a veteran who starts in the eleven", () => {
    const veteran = (state: GameState): GameState => ({ ...state, players: { ...state.players, [star.id]: { ...star, age: 35 } } });
    const day = runTransferDay(withDuty(veteran(offered(start)), "selling", true), []);
    expect(day.state.players[star.id]?.clubId).toBe(COACH);
    expect(coachMarketOf(day.state).bids[star.id]).toBeDefined();
  });

  it("switched on, leaves to the coach an offer for the captain", () => {
    const day = runTransferDay(withDuty(nameCaptain(offered(start), COACH, surplus.id), "selling", true), []);
    expect(day.state.players[surplus.id]?.clubId).toBe(COACH);
    expect(coachMarketOf(day.state).bids[surplus.id]).toBeDefined();
  });

  it("switched on for a waiting hot-seat coach, sells for him as for the coach in the seat", () => {
    const twoCoaches = loadNewGame(5, { coachClubId: COACH, hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "santos-sp" }] } });
    const anaWaits = swapSeat(withDuty(offered(twoCoaches), "selling", true), 0);
    const day = runTransferDay(anaWaits, []);
    expect(day.state.players[surplus.id]?.clubId).toBe("palmeiras-sp");
    expect(day.events).toContainEqual(expect.objectContaining({ type: "playerMoved", playerId: surplus.id, fee: 1_200_000, byAssistant: true }));
    expect(day.state.waitingCoaches?.[0]?.market?.bids[star.id]).toBeDefined();
  });

  it("switched off, leaves every offer to the coach", () => {
    const day = runTransferDay(offered(start), []);
    expect(day.state.players[surplus.id]?.clubId).toBe(COACH);
    expect(coachMarketOf(day.state).bids[surplus.id]).toBeDefined();
  });
});
