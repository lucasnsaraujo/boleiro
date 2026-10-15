import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { addDays } from "../dates.js";
import type { ClubFinance, GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { bookFriendly, dropCoachFriendlies, freeFriendlyDates, friendlyFee, friendlyOffers } from "./friendlies.js";

const CLUB = "bahia-ba";
const start = loadNewGame(5, { coachClubId: CLUB });

const financeOf = (state: GameState, clubId: string): ClubFinance => {
  const finance = state.finances[clubId];
  if (!finance) throw new Error(`no finances for ${clubId}`);
  return finance;
};

function playUntil(state: GameState, date: string): { state: GameState; events: DayEvent[] } {
  let current = state;
  const events: DayEvent[] = [];
  while (current.date < date) {
    const day = advanceDay(current, {});
    current = day.state;
    events.push(...day.events);
  }
  return { state: current, events };
}

const firstFree = (state: GameState, opponentId: string): string => {
  const date = freeFriendlyDates(state).find((d) => bookFriendly(state, opponentId, d, true).answer.booked);
  if (!date) throw new Error(`no free date against ${opponentId}`);
  return date;
};

describe("a friendly", () => {
  it("is refused by a much bigger club asked to visit a small ground", () => {
    const flamengo = "flamengo-rj";
    const small = { ...start, coachClubId: "juazeirense-ba" };
    const date = freeFriendlyDates(small).find((d) => bookFriendly(small, flamengo, d, false).answer.booked);
    if (!date) throw new Error("no free date");
    expect(bookFriendly(small, flamengo, date, true).answer).toMatchObject({ booked: false, reason: "refused" });
  });

  it("pays a bigger appearance fee to a club with more fans", () => {
    const flamengo = start.clubs["flamengo-rj"];
    const small = start.clubs["juazeirense-ba"];
    if (!flamengo || !small) throw new Error("clubs missing");
    expect(friendlyFee(start, flamengo)).toBeGreaterThan(friendlyFee(start, small));
    expect(friendlyFee(start, flamengo)).toBeLessThanOrEqual(1_000_000);
    expect(friendlyFee(start, small)).toBeGreaterThan(0);
  });

  it("is booked only on a date after today with no match for either club the day before, on or after", () => {
    const dates = freeFriendlyDates(start);
    expect(dates.length).toBeGreaterThan(0);
    const busy = new Set(start.fixtures.filter((f) => f.homeId === CLUB || f.awayId === CLUB).flatMap((f) => [addDays(f.date, -1), f.date, addDays(f.date, 1)]));
    for (const date of dates) {
      expect(date > start.date).toBe(true);
      expect(busy.has(date)).toBe(false);
    }
    const matchDay = start.fixtures.find((f) => f.homeId === CLUB || f.awayId === CLUB)?.date ?? "";
    expect(bookFriendly(start, "vitoria-ba", matchDay, true).answer).toMatchObject({ booked: false, reason: "date" });
    expect(bookFriendly(start, "vitoria-ba", start.date, true).answer).toMatchObject({ booked: false, reason: "date" });
  });

  it("is played on its day: the host keeps the gate and pays the visitor's fee", () => {
    const opponent = "juazeirense-ba";
    const date = firstFree(start, opponent);
    const { state, answer } = bookFriendly(start, opponent, date, true);
    if (!answer.booked) throw new Error("friendly refused");
    const visitor = start.clubs[opponent];
    if (!visitor) throw new Error("no visitor");
    expect(answer.friendly).toMatchObject({ date, homeId: CLUB, awayId: opponent, fee: friendlyFee(start, visitor), result: null });
    const played = playUntil(state, addDays(date, 1));
    const event = played.events.find((e) => e.type === "friendlyPlayed");
    if (event?.type !== "friendlyPlayed") throw new Error("friendly not played");
    expect(event.friendly.result).not.toBeNull();
    expect(event.gate).toBeGreaterThan(0);
    const month = (s: GameState, id: string) => financeOf(s, id).month;
    const without = playUntil(start, addDays(date, 1)).state;
    expect(month(played.state, CLUB).costs.friendlies).toBe(answer.friendly.fee);
    expect(month(played.state, CLUB).revenue.tickets - month(without, CLUB).revenue.tickets).toBe(event.gate);
    expect(month(played.state, opponent).revenue.friendlies).toBe(answer.friendly.fee);
    expect(played.state.friendlies?.find((f) => f.id === answer.friendly.id)?.result).toEqual(event.friendly.result);
  });

  it("leaves the day's official results as they were", () => {
    const opponent = "juazeirense-ba";
    const date = firstFree(start, opponent);
    const { state } = bookFriendly(start, opponent, date, true);
    const results = (s: GameState) => s.fixtures.filter((f) => f.result).map((f) => [f.id, f.result?.homeGoals, f.result?.awayGoals]);
    expect(results(playUntil(state, addDays(date, 2)).state)).toEqual(results(playUntil(start, addDays(date, 2)).state));
  });

  it("is refused by a host who can't pay the coach's fee", () => {
    const opponent = "vitoria-ba";
    const broke = { ...start, finances: { ...start.finances, [opponent]: { ...financeOf(start, opponent), cash: 0 } } };
    const date = firstFree(start, opponent);
    expect(bookFriendly(broke, opponent, date, false).answer).toMatchObject({ booked: false, reason: "cash" });
  });

  it("is offered by clubs that would host the coach's club and pay its fee", () => {
    const offers = friendlyOffers(start);
    expect(offers.length).toBeGreaterThan(0);
    const club = start.clubs[CLUB];
    if (!club) throw new Error("no club");
    for (const offer of offers) {
      expect(offer.fee).toBe(friendlyFee(start, club));
      expect(bookFriendly(start, offer.hostId, offer.date, false).answer.booked).toBe(true);
    }
    expect(friendlyOffers(start)).toEqual(offers);
  });

  it("is called off when the host can no longer pay the fee on the day", () => {
    const opponent = "vitoria-ba";
    const date = firstFree(start, opponent);
    const { state } = bookFriendly(start, opponent, date, false);
    const broke = { ...state, finances: { ...state.finances, [opponent]: { ...financeOf(state, opponent), cash: 0 } } };
    const played = playUntil(broke, addDays(date, 1));
    expect(played.events.find((e) => e.type === "friendlyCalledOff")).toMatchObject({ reason: "cash" });
    expect(financeOf(played.state, CLUB).month.revenue.friendlies).toBe(0);
  });

  it("is dropped when the coach leaves the club before its day", () => {
    const opponent = "vitoria-ba";
    const { state } = bookFriendly(start, opponent, firstFree(start, opponent), true);
    expect(dropCoachFriendlies(state, CLUB).friendlies).toEqual([]);
  });

  it("survives a save and load", () => {
    const opponent = "juazeirense-ba";
    const { state } = bookFriendly(start, opponent, firstFree(start, opponent), true);
    expect(loadGame(saveGame(state))).toStrictEqual(state);
  });
});
