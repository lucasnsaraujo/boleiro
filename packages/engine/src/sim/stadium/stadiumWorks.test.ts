import { describe, expect, it } from "vitest";
import { advanceDay, type DayEvent } from "../advanceDay.js";
import { addDays } from "../dates.js";
import type { GameState } from "../gameState.js";
import { loadNewGame } from "../loadNewGame.js";
import { loadGame, saveGame } from "../saveGame.js";
import { requestStadiumWorks, worksQuote } from "./stadiumWorks.js";

const CLUB = "santos-sp";
const start = loadNewGame(5, { coachClubId: CLUB });
const SEATS = 5_000;

function withFinance(state: GameState, change: Partial<NonNullable<GameState["finances"][string]>>): GameState {
  const finance = state.finances[CLUB];
  if (!finance) throw new Error(`no finances for ${CLUB}`);
  return { ...state, finances: { ...state.finances, [CLUB]: { ...finance, ...change } } };
}

function withPressure(state: GameState, pressure: number): GameState {
  const board = state.boards[CLUB];
  if (!board) throw new Error(`no board at ${CLUB}`);
  return { ...state, boards: { ...state.boards, [CLUB]: { ...board, pressure } } };
}

const quote = worksQuote(SEATS);
const rich = withFinance(start, { cash: quote.cost * 2, loans: 0, wagesOwed: 0 });

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

describe("a stadium expansion asked of the board", () => {
  it("costs more and takes longer for more seats", () => {
    const small = worksQuote(2_000);
    const big = worksQuote(10_000);
    expect(big.cost).toBeGreaterThan(small.cost);
    expect(big.months).toBeGreaterThan(small.months);
    expect(small.months).toBeGreaterThanOrEqual(3);
  });

  it("is approved when the club has the cash and the board trusts the coach", () => {
    const { answer, state } = requestStadiumWorks(rich, SEATS);
    expect(answer).toMatchObject({ approved: true, quote });
    expect(state.finances[CLUB]?.stadiumWorks).toMatchObject({ seats: SEATS, cost: quote.cost, paid: 0, startedOn: start.date });
  });

  it("is refused when the cash can't cover half of the bill", () => {
    const poor = withFinance(start, { cash: quote.cost / 4, loans: 0, wagesOwed: 0 });
    const { answer, state } = requestStadiumWorks(poor, SEATS);
    expect(answer).toMatchObject({ approved: false, reason: "cash" });
    expect(state).toBe(poor);
  });

  it("is refused when the board doubts the coach, however rich the club", () => {
    expect(requestStadiumWorks(withPressure(rich, 1), SEATS).answer).toMatchObject({ approved: false, reason: "trust" });
  });

  it("is refused while other works are under way", () => {
    const building = requestStadiumWorks(rich, SEATS).state;
    expect(requestStadiumWorks(building, 2_000).answer).toMatchObject({ approved: false, reason: "building" });
  });

  it("is refused past the size of Brazil's biggest stadiums", () => {
    expect(requestStadiumWorks(rich, 200_000).answer).toMatchObject({ approved: false, reason: "capacity" });
  });

  it("refuses seat counts that aren't a positive whole number", () => {
    expect(() => requestStadiumWorks(rich, 0)).toThrow();
    expect(() => requestStadiumWorks(rich, 10.5)).toThrow();
  });
});

describe("stadium works under way", () => {
  const approved = requestStadiumWorks(rich, SEATS).state;
  const opensOn = approved.finances[CLUB]?.stadiumWorks?.opensOn ?? "";
  const { state: built, events } = playUntil(approved, addDays(opensOn, -1));
  const opened = playUntil(built, opensOn);

  it("are paid in monthly instalments booked as infrastructure until the bill is settled", () => {
    const paid = built.finances[CLUB]?.stadiumWorks?.paid ?? 0;
    expect(paid).toBeGreaterThan(0);
    expect(paid).toBeLessThan(quote.cost);
    expect(events.filter((e) => e.type === "stadiumOpened")).toEqual([]);
  });

  it("add the seats on the day they open and pay off the rest", () => {
    const after = opened.state;
    const capacity = start.clubs[CLUB]?.capacity ?? 0;
    expect(after.clubs[CLUB]?.capacity).toBe(capacity + SEATS);
    expect(after.finances[CLUB]?.stadiumWorks).toBeUndefined();
    expect(opened.events.filter((e) => e.type === "stadiumOpened")).toEqual([{ type: "stadiumOpened", clubId: CLUB, seats: SEATS, capacity: capacity + SEATS }]);
  });

  it("let a club that sold out fill some of its new seats", () => {
    const before = approved.finances[CLUB]?.baseCrowd ?? 0;
    expect(opened.state.finances[CLUB]?.baseCrowd).toBeGreaterThan(before);
  });

  it("survive a save and load", () => {
    expect(loadGame(saveGame(built))).toEqual(built);
  });
});
